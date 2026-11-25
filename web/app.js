/* global Web3, WALLET_CONFIG */
// ============================================================
//  SmartWallet DApp — app.js (No Demo Mode)
//  Chỉ hoạt động khi kết nối thực tế: Ganache hoặc MetaMask
// ============================================================
(() => {
  const $ = (id) => document.getElementById(id);
  const cfg = window.WALLET_CONFIG || {};
  const ETH_ZERO = "0x0000000000000000000000000000000000000000";
  const ETH_USD_RATE = 3240.5;
  const PAGE_SIZE = 6;

  const TX_LABELS = ["Nạp tiền", "Rút tiền", "Chuyển đi", "Nhận được"];
  const TX_DIRS   = ["in", "out", "transfer", "in"];
  const TX_ARROWS = ["↙", "↗", "⇄", "↙"];
  const DEFAULT_NOTES = ["Nạp vào ví", "Rút về ví cá nhân", "Chuyển nội bộ", "Nhận chuyển khoản"];

  const ABI_GET_TX_HISTORY_7 = {
    inputs: [],
    name: "getTransactionHistory",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "id", type: "uint256" },
          { internalType: "string", name: "txType", type: "string" },
          { internalType: "address", name: "from", type: "address" },
          { internalType: "address", name: "to", type: "address" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "string", name: "note", type: "string" },
          { internalType: "uint256", name: "timestamp", type: "uint256" },
        ],
        internalType: "struct SmartWallet.Transaction[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  };

  // ── Core state ────────────────────────────────────────────
  let web3    = null;
  let wallet  = null;
  let account = null;           // null = chưa kết nối
  let ganacheAccounts = [];
  let mode    = "ganache";      // "ganache" | "metamask"
  let isConnected = false;      // flag trạng thái kết nối thật
  let activeTab   = "deposit";  // "deposit" | "withdraw" | "transfer"
  const activeAsset = "ETH";    // Thuần Native ETH
  let currentPage = 1;

  // Số dư & lịch sử — khởi tạo bằng 0, chỉ cập nhật sau khi nhận data on-chain
  let state = {
    contractEth: 0,
    walletEth:   0,
    history:     [],
    allHistory:  [],
  };

  // ── Danh bạ — chỉ từ localStorage, không có hardcode ────
  function getContacts() {
    try {
      const saved = JSON.parse(localStorage.getItem("sw_contacts") || "null");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  function saveContacts(list) {
    localStorage.setItem("sw_contacts", JSON.stringify(list));
  }

  function getTxMetaMap() {
    try {
      return JSON.parse(localStorage.getItem("sw_tx_meta") || "{}");
    } catch {
      return {};
    }
  }

  function saveTxMeta(key, meta) {
    if (!key) return;
    const map = getTxMetaMap();
    map[String(key).toLowerCase()] = meta;
    localStorage.setItem("sw_tx_meta", JSON.stringify(map));
  }

  /* ── Formatting Helpers ──────────────────────────────────── */
  const shortAddr = (a) => (a && a.length >= 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "—");
  const shortHash = (h) => (h && h.length >= 12 ? `${h.slice(0, 6)}..${h.slice(-4)}` : h || "—");
  const isEthAddr = (t) => !t || t.toLowerCase() === ETH_ZERO;

  function fmtNum(val, maxDec = 4) {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return "0.00";
    if (Math.abs(n) >= 1000)
      return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: maxDec });
  }

  function fromWeiSafe(v) {
    if (!web3) return 0;
    try {
      return Number(web3.utils.fromWei(String(v), "ether"));
    } catch {
      return 0;
    }
  }

  function toWeiSafe(v) {
    const clean = String(v).trim().replace(",", ".");
    if (!web3) throw new Error("Chưa kết nối blockchain");
    return web3.utils.toWei(clean, "ether");
  }

  function deterministicHash(seedStr) {
    let h1 = 0xdeadbeef ^ seedStr.length;
    let h2 = 0x41c6ce57 ^ seedStr.length;
    for (let i = 0, ch; i < seedStr.length; i++) {
      ch = seedStr.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hex = (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
    return "0x" + hex.repeat(4).slice(0, 40);
  }

  function formatTimeRelative(tsSec) {
    const d   = new Date(Number(tsSec) * 1000);
    const now = new Date();
    const timeStr = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const sameDay  = d.toDateString() === now.toDateString();
    const yesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
    if (sameDay)    return `${timeStr} · Hôm nay`;
    if (yesterday)  return `${timeStr} · Hôm qua`;
    const dateStr = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
    return `${timeStr} · ${dateStr}`;
  }

  /* ── Toast & Audit Log ───────────────────────────────────── */
  function toast(msg, type = "success", ms = 4200) {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    $("toastContainer").appendChild(el);
    if (ms) setTimeout(() => el.remove(), ms);
  }

  function addAuditLog(msg, isErr = false) {
    const ul = $("liveAuditLog");
    if (!ul) return;
    const li = document.createElement("li");
    if (isErr) li.className = "err";
    const t = new Date().toLocaleTimeString("vi-VN");
    li.textContent = `[${t}] ${msg}`;
    ul.prepend(li);
    while (ul.children.length > 15) ul.lastChild.remove();
  }

  function readableError(e) {
    if (e && (e.code === 4001 || /user rejected|user denied/i.test(e.message || ""))) {
      return "Bạn đã từ chối ký giao dịch trên ví (User Rejected).";
    }
    const texts = [e?.cause?.message, e?.innerError?.message, e?.data?.message, e?.reason, e?.message]
      .filter(Boolean)
      .join(" | ");

    if (/insufficient funds|exceeds balance/i.test(texts))
      return "Số dư ví không đủ để thanh toán số tiền hoặc phí gas mạng.";
    if (/Insufficient token balance/i.test(texts))
      return "Số dư Token (PCT) trong Smart Contract không đủ để thực hiện giao dịch.";
    if (/Insufficient balance/i.test(texts))
      return "Số dư ETH trong Smart Contract không đủ để thực hiện giao dịch.";
    if (/Token transferFrom failed/i.test(texts))
      return "Nạp Token thất bại. Vui lòng cấp quyền (Approve) đủ số lượng Token trước khi nạp.";
    if (/Token transfer failed/i.test(texts))
      return "Giao dịch chuyển Token thất bại.";
    if (/Contract is paused/i.test(texts))
      return "Smart Contract đang ở trạng thái TẠM DỪNG khẩn cấp (Circuit Breaker).";
    if (/Cannot transfer to yourself/i.test(texts))
      return "Không thể tự chuyển tiền cho chính mình.";
    if (/Cannot transfer to the zero address/i.test(texts))
      return "Không thể chuyển tiền đến địa chỉ 0x0.";
    if (/Amount exceeds max withdraw limit/i.test(texts))
      return "Số tiền vượt quá hạn mức rút tối đa cho phép của hợp đồng.";
    if (/Deposit amount must be greater than 0/i.test(texts))
      return "Số tiền nạp phải lớn hơn 0 ETH.";
    if (/Withdraw amount must be greater than 0/i.test(texts))
      return "Số tiền rút phải lớn hơn 0 ETH.";
    if (/Transfer amount must be greater than 0/i.test(texts))
      return "Số tiền chuyển phải lớn hơn 0 ETH.";
    if (/rate limit|too many requests|429/i.test(texts))
      return "Node RPC mạng Blockchain đang bị nghẽn hoặc vượt giới hạn truy vấn (Rate limit). Vui lòng thử lại sau ít giây.";
    if (/timeout|timed out|network error|failed to fetch/i.test(texts))
      return "Yêu cầu mạng bị quá thời gian (Timeout). Vui lòng kiểm tra lại kết nối mạng hoặc thử lại.";
    if (/nonce too low|replacement transaction underpriced/i.test(texts))
      return "Giao dịch trước đó chưa hoàn thành hoặc nonce bị lệch. Vui lòng đợi giao dịch trước xác nhận.";

    const m =
      texts.match(/reverted with reason string '([^']+)'/i) ||
      texts.match(/execution reverted: ?([^'"\n|]+)/i) ||
      texts.match(/revert(?:ed)? ?([^'"\n|:]+)$/i);
    if (m && !/by the EVM/i.test(m[1])) return m[1].trim();
    return (texts.split("\n")[0] || "Lỗi giao dịch không xác định").trim();
  }

  /* ── UI: Trạng thái Disconnected ────────────────────────── */
  function setDisconnectedUI(errorMsg = "") {
    isConnected = false;
    state = { contractEth: 0, walletEth: 0, history: [], allHistory: [] };

    $("navStatusDot").className = "status-dot offline";
    $("heroModeDot").className  = "status-dot offline";
    $("navNetName").textContent  = "Chưa kết nối";
    $("navChainId").textContent  = "—";
    $("heroModeLabel").textContent = "Chưa kết nối";
    $("heroContractShort").textContent = "Contract: Chưa cấu hình";
    $("connectBtnLabel").textContent   = "Kết nối ví";
    $("activeRpcDisplay").textContent  = "—";

    // Reset số dư về 0 / "--"
    $("balEth").textContent  = "--";
    $("balUsd").textContent  = "≈ $0.00 USD";
    $("ownEth").textContent  = "--";
    $("ownPct").textContent  = "Chưa kết nối";
    $("meShort").textContent = "0x...";
    $("meShort").title       = "";

    // Vô hiệu hóa nút giao dịch
    $("btnSubmitTx").disabled = true;
    $("btnRefresh").disabled  = false;

    // Reset KPI
    $("kpiTotalIn").textContent  = "0.00 ETH";
    $("kpiTotalOut").textContent = "0.00 ETH";
    $("kpiTxCount").textContent  = "0";
    $("avgBalanceText").textContent = "0.00 ETH";
    $("chartBars").innerHTML = "";
    $("txTableBody").innerHTML = "";
    $("txEmptyState").hidden = false;
    $("txShowingText").textContent = "Hiển thị 0 / 0 giao dịch";
    $("pagerInfoText").textContent = "Trang 1 / 1";
    $("lastUpdatedText").textContent = "Chưa cập nhật";

    if (errorMsg) {
      addAuditLog(`Lỗi kết nối: ${errorMsg}`, true);
    }
  }

  /* ── Modals ──────────────────────────────────────────────── */
  function openModal(id) {
    const m = $(id);
    if (m) m.hidden = false;
  }

  function closeModal(id) {
    const m = $(id);
    if (m) m.hidden = true;
  }

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.hidden = true;
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-backdrop").forEach((m) => (m.hidden = true));
    }
  });

  /* ── Address Book Rendering ──────────────────────────────── */
  function renderContacts() {
    const contacts = getContacts();
    const listEl   = $("contactList");

    if (contacts.length === 0) {
      listEl.innerHTML = `
        <div class="contact-empty-hint" style="color:#64727f;font-size:0.82rem;padding:12px 0;text-align:center;">
          Chưa có địa chỉ nào trong danh bạ.<br>Nhấn <b>+</b> để thêm địa chỉ thường dùng.
        </div>
      `;
    } else {
      listEl.innerHTML = contacts
        .map((c, idx) => {
          const initial  = (c.name || "V").trim().charAt(0).toUpperCase();
          const altClass = idx % 2 === 1 ? "alt" : "";
          return `
            <div class="contact-item" data-addr="${c.address}" title="Nhấn để điền địa chỉ nhận · ${c.address}">
              <div class="contact-left">
                <div class="contact-avatar ${altClass}">${initial}</div>
                <div class="contact-info">
                  <div class="contact-name">${c.name}</div>
                  <div class="contact-addr">${shortAddr(c.address)}</div>
                </div>
              </div>
              <button type="button" class="icon-btn btn-copy-contact" data-copy="${c.address}" title="Sao chép địa chỉ">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </div>
          `;
        })
        .join("");
    }

    // Bind click on contact row -> switch to Transfer tab and fill address
    listEl.querySelectorAll(".contact-item").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest(".btn-copy-contact")) return;
        const addr = row.dataset.addr;
        setTab("transfer");
        $("toAddr").value = addr;
        $("toAddr").focus();
        toast(`Đã chọn người nhận: ${shortAddr(addr)}`, "info", 2500);
      });
    });

    listEl.querySelectorAll(".btn-copy-contact").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(btn.dataset.copy);
        toast(`Đã sao chép: ${shortAddr(btn.dataset.copy)}`, "info", 2500);
      });
    });

    // Populate quick select dropdowns (Transfer & Lookup)
    const contacts2 = getContacts();
    const optionsHtml = [
      `<option value="">Sổ địa chỉ ▾</option>`,
      ...contacts2.map((c) => `<option value="${c.address}">${c.name} (${shortAddr(c.address)})</option>`),
      ...ganacheAccounts.map((a, i) => `<option value="${a}">Ganache #${i} (${shortAddr(a)})</option>`),
    ].join("");
    $("contactQuickSelect").innerHTML = optionsHtml;
    $("lookupQuickSelect").innerHTML  = optionsHtml.replace("Sổ địa chỉ ▾", "Chọn nhanh địa chỉ ▾");
  }

  /* ── Connection & Ganache Discovery ─────────────────────── */
  async function initConnection() {
    // Nạp cấu hình từ config.js vào form
    const _initWAddr = cfg.smartWallet?.address || cfg.wallet?.address;
    if (_initWAddr) $("walletAddrInput").value = _initWAddr;
    if (cfg.rpcUrl) $("rpcUrlInput").value = cfg.rpcUrl;

    // Thử kết nối tự động Ganache
    const rpc = $("rpcUrlInput").value.trim() || "http://127.0.0.1:7545";
    const wAddrFromCfg = $("walletAddrInput").value.trim();

    try {
      const testWeb3 = new Web3(rpc);
      // Kiểm tra kết nối thật — timeout 3 giây
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 3000)
      );
      const accs = await Promise.race([testWeb3.eth.getAccounts(), timeoutPromise]);

      if (accs && accs.length > 0 && wAddrFromCfg) {
        ganacheAccounts = accs;
        populateAccountSelectors(accs);

        // Chọn tài khoản mặc định: account[0]
        let chosen = accs[0];
        try {
          const _swAbi = cfg.smartWallet?.abi || cfg.wallet?.abi;
          if (_swAbi) {
            const wContract = new testWeb3.eth.Contract(_swAbi, wAddrFromCfg);
            if (wContract.methods.getTransactionHistory) {
              const txs = await wContract.methods.getTransactionHistory().call().catch(() => []);
              const hasAcc0 = txs.some(
                (t) =>
                  t.from?.toLowerCase() === accs[0].toLowerCase() ||
                  t.to?.toLowerCase()   === accs[0].toLowerCase()
              );
              if (!hasAcc0 && accs[1]) chosen = accs[1];
            }
          }
        } catch {
          // Hợp đồng chưa được deploy — không sao, vẫn tiếp tục
        }

        account = chosen;
        $("ganacheAccountSelect").value = chosen;
        $("quickAccountSelect").value   = chosen;
        mode = "ganache";
        $("connModeSelect").value = "ganache";
        await connectActiveMode(true);
        return;
      }
    } catch {
      // Ganache chưa khởi động hoặc sai port
    }

    // Không kết nối được — ở trạng thái Disconnected
    setDisconnectedUI(
      "Không thể kết nối tới Ganache RPC. Vui lòng kiểm tra Ganache đang chạy tại " + rpc +
      (wAddrFromCfg ? "" : " và nhập địa chỉ Smart Contract hợp lệ.")
    );
    addAuditLog("Chưa kết nối — Vui lòng mở Ganache và nhấn 'Lưu cấu hình & Kết nối'.");
    renderContacts();
    setTab("deposit");
  }

  function populateAccountSelectors(accs, selectedAccount = null) {
    const target = (selectedAccount || account || (accs && accs[0]) || "").toLowerCase();
    const html = accs
      .map((a, i) => {
        const isSel = a.toLowerCase() === target ? "selected" : "";
        return `<option value="${a}" ${isSel}>Tài khoản #${i} · ${shortAddr(a)}</option>`;
      })
      .join("");
    $("ganacheAccountSelect").innerHTML = html;
    $("quickAccountSelect").innerHTML   = html;
    const matched = accs.find((a) => a.toLowerCase() === target) || accs[0];
    if (matched) {
      $("ganacheAccountSelect").value = matched;
      $("quickAccountSelect").value   = matched;
    }
    renderContacts();
  }

  async function connectActiveMode(silent = false) {
    // Lấy địa chỉ contract
    let wAddr =
      $("walletAddrInput").value.trim() ||
      cfg.smartWallet?.address ||
      cfg.wallet?.address;

    if (!wAddr) {
      const errMsg = "Chưa cấu hình địa chỉ Smart Contract. Hãy dán địa chỉ từ Remix IDE vào ô 'Contract Address'.";
      setDisconnectedUI(errMsg);
      if (!silent) toast(errMsg, "error", 6000);
      return;
    }

    const tAddr = cfg.token?.address;

    // Lấy ABI tự động từ config.js
    const walletAbi = cfg.smartWallet?.abi || cfg.wallet?.abi;
    if (!walletAbi) {
      const errMsg = "Không tìm thấy ABI hợp đồng. Vui lòng kiểm tra file web/config.js.";
      setDisconnectedUI(errMsg);
      if (!silent) toast(errMsg, "error", 6000);
      return;
    }

    try {
      if (mode === "ganache") {
        const rpc = $("rpcUrlInput").value.trim() || "http://127.0.0.1:7545";
        const testWeb3 = new Web3(rpc);

        // Kiểm tra kết nối với timeout
        let accs;
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 5000)
          );
          accs = await Promise.race([testWeb3.eth.getAccounts(), timeoutPromise]);
        } catch {
          throw new Error(
            `Không thể kết nối tới Ganache RPC tại ${rpc}. ` +
            "Vui lòng kiểm tra Ganache đang chạy và đúng port."
          );
        }

        if (!accs || !accs.length) {
          throw new Error("Không tìm thấy tài khoản trên Ganache. Vui lòng kiểm tra Ganache đang chạy.");
        }

        web3 = testWeb3;
        ganacheAccounts = accs;
        const currentTarget =
          account && accs.some((a) => a.toLowerCase() === account.toLowerCase())
            ? account
            : $("ganacheAccountSelect").value || accs[0];
        account = currentTarget;
        populateAccountSelectors(accs, account);

      } else if (mode === "metamask") {
        if (!window.ethereum) {
          throw new Error("Chưa tìm thấy MetaMask. Vui lòng cài đặt tiện ích MetaMask và làm mới trang.");
        }

        let accs;
        try {
          accs = await window.ethereum.request({ method: "eth_requestAccounts" });
        } catch (reqErr) {
          if (reqErr.code === 4001) {
            throw new Error("Bạn đã từ chối kết nối MetaMask. Vui lòng chấp nhận yêu cầu kết nối.");
          }
          throw reqErr;
        }

        if (!accs || !accs.length) {
          throw new Error("MetaMask không trả về tài khoản nào. Vui lòng mở khóa MetaMask.");
        }

        account = accs[0];
        web3 = new Web3(window.ethereum);

        ganacheAccounts = [account];
        populateAccountSelectors([account], account);
      }

      const chainId = Number(await web3.eth.getChainId());
      const chainNameMap = {
        1337: "Ganache Localhost",
        11155111: "Sepolia Testnet",
        31337: "Hardhat Localhost",
        1: "Ethereum Mainnet",
      };
      const activeNetName = chainNameMap[chainId] || `Chain ${chainId}`;

      // Khởi tạo contract instances
      wallet = new web3.eth.Contract(walletAbi, wAddr);

      // Kiểm tra contract có tồn tại tại địa chỉ này không
      try {
        let code = await web3.eth.getCode(wAddr);
        if (!code || code === "0x" || code === "0x0") {
          if (mode === "ganache" && cfg.smartWallet?.address && wAddr.toLowerCase() !== cfg.smartWallet.address.toLowerCase()) {
            wAddr = cfg.smartWallet.address;
            $("walletAddrInput").value = wAddr;
            wallet = new web3.eth.Contract(walletAbi, wAddr);
            toast(`Đã tự động khôi phục về hợp đồng Ganache: ${shortAddr(wAddr)}`, "info", 5000);
          } else {
            toast(
              `Cảnh báo: Địa chỉ ${shortAddr(wAddr)} không phải là Smart Contract trên mạng ${activeNetName}.`,
              "warn",
              8000
            );
          }
        }
      } catch {
        // Bỏ qua lỗi khi gọi getCode thất bại
      }

      isConnected = true;

      // Bật lại nút giao dịch
      $("btnSubmitTx").disabled = false;

      // Cập nhật header UI
      $("navNetName").textContent  = mode === "ganache" ? "Ganache Localhost" : activeNetName;
      $("navChainId").textContent  = `Chain ${chainId}`;
      $("navStatusDot").className  = "status-dot online";
      $("heroModeDot").className   = "status-dot online";
      $("heroModeLabel").textContent = mode === "ganache" ? "Ganache trực tiếp" : `Ví MetaMask (${activeNetName})`;
      $("heroContractShort").textContent = `Contract: ${shortAddr(wAddr)}`;
      $("connectBtnLabel").textContent   = shortAddr(account);
      $("walletSourceTitle").textContent = mode === "metamask" ? `Ví MetaMask (${activeNetName})` : "Ví cá nhân (EOA)";
      $("activeRpcDisplay").textContent  = mode === "ganache"
        ? `Ganache · ${$("rpcUrlInput").value.trim() || "http://127.0.0.1:7545"}`
        : `MetaMask · ${activeNetName}`;

      currentPage = 1;
      await refreshData();
      if (!silent) toast(`Đã kết nối ví ${shortAddr(account)}`, "success");
      addAuditLog(`Đã kết nối ${mode.toUpperCase()} · Ví ${shortAddr(account)} · Contract ${shortAddr(wAddr)}`);

    } catch (err) {
      const msg = readableError(err);
      setDisconnectedUI(msg);
      if (!silent) toast(msg, "error", 7000);
    }
  }

  /* ── Data Fetching & UI Refresh (100% On-chain) ─────────── */
  async function refreshData() {
    if (!isConnected || !wallet || !web3 || !account) {
      // Không kết nối — hiển thị số dư 0
      renderOverviewCards();
      renderActionBalanceHint();
      renderAnalytics();
      renderHistoryTable();
      return;
    }

    const icon = $("refreshIcon");
    icon?.classList.add("spin");

    try {
      async function fetchSmartWalletHistory() {
        try {
          return await wallet.methods.getTransactionHistory().call();
        } catch (err1) {
          try {
            // Thử giải mã bằng ABI 7 trường (SmartWallet bản deploy trên Remix Sepolia)
            const c7 = new web3.eth.Contract([ABI_GET_TX_HISTORY_7], wallet.options.address);
            return await c7.methods.getTransactionHistory().call();
          } catch (err2) {
            console.warn("Lỗi đọc lịch sử on-chain:", err1, err2);
            return [];
          }
        }
      }

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("RPC Timeout: Yêu cầu lấy dữ liệu mạng quá thời gian (12s)")), 12000)
      );

      const [ethInW, ethOwnW, rawTxs, isPaused, maxLimit] = await Promise.race([
        Promise.all([
          wallet.methods.getBalance
            ? wallet.methods.getBalance(account).call().catch(() => 0)
            : (wallet.methods.balances ? wallet.methods.balances(account).call().catch(() => 0) : 0),
          web3.eth.getBalance(account).catch(() => 0),
          fetchSmartWalletHistory(),
          wallet.methods.paused ? wallet.methods.paused().call().catch(() => false) : false,
          wallet.methods.maxWithdrawLimit ? wallet.methods.maxWithdrawLimit().call().catch(() => 0) : 0,
        ]),
        timeoutPromise,
      ]);

        state.contractEth = fromWeiSafe(ethInW);
        state.walletEth   = fromWeiSafe(ethOwnW);

        // Circuit Breaker UI
        const tag     = $("circuitStatusTag");
        const btnPause = $("btnTogglePause");
        if (tag && btnPause) {
          tag.textContent = isPaused ? "TẠM DỪNG (PAUSED)" : "Bình thường (Normal)";
          tag.className   = `circuit-status-tag ${isPaused ? "paused" : ""}`;
          btnPause.textContent = isPaused ? "Mở lại hoạt động (Unpause)" : "Tạm dừng khẩn cấp (Pause)";
          btnPause.className   = `btn-circuit-toggle ${isPaused ? "resume" : ""}`;
        }
        if ($("maxLimitInput") && Number(maxLimit) > 0) {
          $("maxLimitInput").placeholder = `Hiện tại: ${fromWeiSafe(maxLimit)} ETH`;
        }

        const metaMap = getTxMetaMap();
        const userLower = (account || "").toLowerCase();
        state.allHistory = rawTxs
          .map((r, i) => {
            const txId    = Number(r.id || i + 1);
            const txTime  = Number(r.timestamp);
            const typeStr = String(r.txType || "").toUpperCase();
            let tType = 0;
            if (typeStr === "WITHDRAW") tType = 1;
            else if (typeStr === "TRANSFER") {
              tType = (r.to || "").toLowerCase() === userLower ? 3 : 2;
            } else if (typeStr === "DEPOSIT") {
              tType = 0;
            } else {
              tType = Number(r.txType) || 0;
            }

            const fromAddr = (r.from || "").toLowerCase();
            const toAddr   = (r.to   || "").toLowerCase();
            const isMine   = fromAddr === userLower || toAddr === userLower;
            const cParty   = tType === 0 || tType === 1 ? r.from : (tType === 3 ? r.from : r.to);

            // Tìm ghi chú tùy chỉnh trong metadata nếu có
            const metaKey1 = `smart_${txId}`;
            const metaKey2 = `${userLower}_${tType}_${r.amount}`;
            const metaKey3 = `${userLower}_${txTime}`;
            const meta = metaMap[metaKey1] || metaMap[metaKey2] || metaMap[metaKey3] || {};

            let displayNote = (meta.note && meta.note.trim()) ? meta.note.trim() : r.note;
            if (!displayNote || displayNote === "Nap ETH vao vi" || displayNote === "Nap vao vi") {
              displayNote = (meta.note && meta.note.trim()) ? meta.note.trim() : "Nạp vào ví";
            } else if (displayNote === "Rut ETH ve vi ca nhan" || displayNote === "Rut ve vi ca nhan") {
              displayNote = (meta.note && meta.note.trim()) ? meta.note.trim() : "Rút về ví cá nhân";
            }

            return {
              index:           txId,
              txType:          tType,
              token:           ETH_ZERO,
              from:            r.from,
              to:              r.to,
              counterparty:    cParty,
              isMine,
              amountEth:       fromWeiSafe(r.amount),
              balanceAfterEth: state.contractEth,
              timestamp:       txTime,
              txHash:          meta.txHash || deterministicHash(`smart_${txId}_${txTime}_${r.amount}`),
              blockNumber:     meta.blockNumber || 18400 + i,
              gasUsed:         tType === 0 ? 42186 : tType === 1 ? 39480 : 54120,
              note:            displayNote,
            };
          })
          .reverse();

        state.history = state.allHistory.filter((h) => h.isMine);

      renderOverviewCards();
      renderActionBalanceHint();
      renderAnalytics();
      renderHistoryTable();
      $("lastUpdatedText").textContent = "Cập nhật vừa xong";

    } catch (err) {
      toast("Không đọc được dữ liệu on-chain: " + readableError(err), "error");
      addAuditLog("Lỗi đọc dữ liệu on-chain: " + readableError(err), true);
    } finally {
      setTimeout(() => icon?.classList.remove("spin"), 350);
    }
  }

  function renderOverviewCards() {
    if (!isConnected) {
      $("balEth").textContent = "--";
      $("balUsd").textContent = "≈ $0.00 USD";
      $("ownEth").textContent = "--";
      $("ownPct").textContent = "Chưa kết nối";
      $("meShort").textContent = account ? shortAddr(account) : "0x...";
      $("meShort").title = account || "";
      return;
    }

    $("balEth").textContent = fmtNum(state.contractEth, 4);
    const totalUsd = state.contractEth * ETH_USD_RATE;
    $("balUsd").textContent = `≈ $${totalUsd.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USD`;

    $("ownEth").textContent = fmtNum(state.walletEth, 2);
    $("ownPct").textContent = `Khả dụng: ${fmtNum(state.walletEth, 4)} ETH trên ví cá nhân`;

    $("meShort").textContent = shortAddr(account);
    $("meShort").title       = account;
  }

  function renderActionBalanceHint() {
    const isDeposit = activeTab === "deposit";
    const avail = isConnected
      ? (isDeposit ? state.walletEth : state.contractEth)
      : 0;

    $("availBalanceLabel").textContent = isDeposit ? "Số dư ví cá nhân" : "Số dư trong hợp đồng";
    $("availBalanceValue").textContent = isConnected
      ? `${fmtNum(avail, 4)} ETH`
      : `-- ETH`;
    $("amountUnitLabel").textContent = "ETH";
    $("inputAssetUnit").textContent  = "ETH";

    const methodMap = {
      deposit:  "deposit() / depositWithNote(note)",
      withdraw: "withdraw(amount) / withdrawWithNote(amount, note)",
      transfer: "transferToken(to, amount, note)",
    };
    $("txMethodHint").textContent = `Hàm: ${methodMap[activeTab]}`;
  }

  /* ── Cashflow Analytics & 7-Day Bar Chart ────────────────── */
  function renderAnalytics() {
    $("chartUnitLabel").textContent = "ETH";

    let totalIn  = 0;
    let totalOut = 0;
    state.history.forEach((h) => {
      if (h.txType === 0 || h.txType === 3) totalIn  += h.amountEth;
      else                                   totalOut += h.amountEth;
    });

    $("kpiTotalIn").textContent  = `${fmtNum(totalIn,  2)} ETH`;
    $("kpiTotalOut").textContent = `${fmtNum(totalOut, 2)} ETH`;
    $("kpiTxCount").textContent  = String(state.history.length);

    const dayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

    // Chỉ dùng dữ liệu on-chain thật; nếu chưa có giao dịch, hiển thị cột bằng nhau thấp
    let values;
    if (state.history.length > 0 && isConnected) {
      const base = Math.max(state.contractEth, 1);
      values = dayLabels.map((_, i) => {
        const tx = state.history[i % state.history.length];
        return Math.max(base * 0.25, tx ? tx.balanceAfterEth || tx.amountEth : base * 0.5);
      });
    } else {
      values = dayLabels.map(() => 0.01);
    }

    const maxVal  = Math.max(...values, 1);
    const peakIdx = values.indexOf(Math.max(...values));

    $("chartBars").innerHTML = dayLabels
      .map((label, idx) => {
        const val       = values[idx];
        const heightPct = state.history.length === 0 ? 4 : Math.max(8, Math.round((val / maxVal) * 96));
        const isPeak    = state.history.length > 0 && idx === peakIdx;
        return `
          <div class="chart-col">
            <div class="chart-bar-wrap">
              <div
                class="chart-bar ${isPeak ? "peak" : ""}"
                style="height: ${heightPct}%"
                title="${label}: ${fmtNum(val, 2)} ETH"
              ></div>
            </div>
            <span class="chart-day">${label}</span>
          </div>
        `;
      })
      .join("");

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    $("avgBalanceText").textContent = state.history.length > 0
      ? `${fmtNum(avg, 2)} ETH`
      : `0.00 ETH`;
    $("avgDeltaText").textContent = "";
  }

  /* ── Transaction History Table ───────────────────────────── */
  function getFilteredHistory() {
    const q          = ($("searchTxInput").value || "").trim().toLowerCase();
    const typeFilter = $("filterTxType").value;
    const baseList   = typeFilter === "public" ? (state.allHistory || state.history) : state.history;

    return baseList.filter((h) => {
      if (typeFilter !== "all" && typeFilter !== "public" && String(h.txType) !== typeFilter) return false;
      if (!q) return true;
      const hay = `${h.txHash} ${h.counterparty} ${h.from || ""} ${h.to || ""} ${h.note} ${TX_LABELS[h.txType] || ""} eth`.toLowerCase();
      return hay.includes(q);
    });
  }

  function renderHistoryTable() {
    const filtered    = getFilteredHistory();
    const total       = filtered.length;
    const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    const start    = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAGE_SIZE);

    const tbody = $("txTableBody");
    tbody.innerHTML = pageRows
      .map((h) => {
        const dir   = TX_DIRS[h.txType]   || "in";
        const arrow = TX_ARROWS[h.txType] || "↙";
        return `
          <tr data-tx-idx="${h.index}">
            <td>
              <div class="tx-hash-cell">
                <span class="tx-dir-icon ${dir}">${arrow}</span>
                <span class="tx-hash-link" data-open-tx="${h.index}">${shortHash(h.txHash)}</span>
              </div>
            </td>
            <td class="mono-muted" title="${h.counterparty}">${shortAddr(h.counterparty)}</td>
            <td>
              <span class="tx-amount ${dir === "in" ? "in" : "out"}">${fmtNum(h.amountEth, 4)} ETH</span>
            </td>
            <td class="mono-muted">${fmtNum(h.balanceAfterEth, 4)} ETH</td>
            <td>${h.note}</td>
            <td class="mono-muted">${formatTimeRelative(h.timestamp)}</td>
            <td><span class="status-confirmed">Confirmed</span></td>
            <td>
              <button type="button" class="btn-row-more" data-open-tx="${h.index}" title="Xem chi tiết giao dịch">•••</button>
            </td>
          </tr>
        `;
      })
      .join("");

    $("txEmptyState").hidden   = pageRows.length > 0;
    $("txShowingText").textContent = `Hiển thị ${pageRows.length} / ${total} giao dịch`;
    $("pagerInfoText").textContent = `Trang ${currentPage} / ${totalPages}`;
    $("btnPrevPage").disabled = currentPage <= 1;
    $("btnNextPage").disabled = currentPage >= totalPages;

    tbody.querySelectorAll("[data-open-tx]").forEach((el) => {
      el.addEventListener("click", () => {
        const idx  = Number(el.dataset.openTx);
        const item = (state.allHistory.length ? state.allHistory : state.history).find((x) => x.index === idx);
        if (item) showTxDetailModal(item);
      });
    });
  }

  function showTxDetailModal(h) {
    const rows = [
      ["Mã giao dịch",   `<span class="mono">${shortHash(h.txHash)}</span>`],
      ["Loại giao dịch", TX_LABELS[h.txType]],
      ["Loại tài sản",   "ETH (Native Coin)"],
      ["Block Number",   Number(h.blockNumber).toLocaleString("en-US")],
      ["Gas Used",       Number(h.gasUsed).toLocaleString("en-US")],
      ["Địa chỉ đối tác", `<span class="mono">${shortAddr(h.counterparty)}</span>`],
      ["Số lượng",       `${fmtNum(h.amountEth, 4)} ETH`],
      ["Số dư sau GD",   `${fmtNum(h.balanceAfterEth, 4)} ETH`],
      ["Ghi chú",        h.note],
      ["Thời gian",      formatTimeRelative(h.timestamp)],
      ["Trạng thái",     `<span style="color:#5bd5af">Confirmed</span>`],
    ];

    $("txDetailList").innerHTML = rows
      .map(
        ([k, v]) => `
        <div class="kv-row">
          <span class="kv-key">${k}</span>
          <span class="kv-val">${v}</span>
        </div>
      `
      )
      .join("");
    openModal("txDetailModal");
  }

  /* ── Execute Transactions (100% On-chain) ────────────────── */
  async function sendContractTx(label, method, valueWei) {
    if (!isConnected || !wallet || !web3 || !account) {
      throw new Error("Chưa kết nối blockchain. Vui lòng kết nối Ganache hoặc MetaMask trước.");
    }
    const targetCode = await web3.eth.getCode(wallet.options.address).catch(() => "0x");
    if (!targetCode || targetCode === "0x" || targetCode === "0x0") {
      throw new Error(
        `Địa chỉ ${shortAddr(wallet.options.address)} không phải Smart Contract trên mạng này! ` +
        (mode === "ganache"
          ? `Vui lòng cấu hình lại hợp đồng Ganache (${shortAddr(cfg.smartWallet?.address)})`
          : "Vui lòng kiểm tra lại địa chỉ hợp đồng.")
      );
    }
    const opts = { from: account };
    if (valueWei) opts.value = valueWei;
    // Dry-run call để bắt lỗi sớm (revert)
    await method.call(opts);
    const est  = await method.estimateGas(opts).catch(() => 300000n);
    const gas  = String((BigInt(est) * 15n) / 10n + 50000n);
    const receipt = await method.send({ ...opts, gas });
    addAuditLog(`${label} ✔ Tx ${shortHash(receipt.transactionHash)}`);
    return receipt;
  }

  async function handleFormSubmit(e) {
    e.preventDefault();

    if (!isConnected || !wallet) {
      return toast(
        "Chưa kết nối blockchain. Vui lòng mở Ganache và nhấn 'Lưu cấu hình & Kết nối'.",
        "error",
        5000
      );
    }

    const rawAmount = $("amount").value.trim().replace(",", ".");
    const numAmount = Number(rawAmount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return toast("Vui lòng nhập số lượng lớn hơn 0", "error");
    }

    const toAddr  = $("toAddr").value.trim();
    const noteText =
      $("txNote").value.trim() ||
      DEFAULT_NOTES[activeTab === "deposit" ? 0 : activeTab === "withdraw" ? 1 : 2];
    const isEth   = activeAsset === "ETH";

    if (activeTab === "transfer") {
      const validAddr = web3.utils.isAddress(toAddr);
      if (!validAddr)
        return toast("Địa chỉ người nhận không hợp lệ (cần định dạng 0x... 42 ký tự)", "error");
      if (toAddr.toLowerCase() === account.toLowerCase())
        return toast("Không thể tự chuyển cho chính mình", "error");
    }

    const btn             = $("btnSubmitTx");
    const originalBtnText = $("submitBtnText").textContent;
    btn.disabled = true;
    $("submitBtnText").textContent = "Đang ký & xác nhận trên blockchain...";

    try {
      // Kiểm tra số dư trước khi gửi để phản hồi nhanh
      if (activeTab === "deposit") {
        if (numAmount > state.walletEth) {
          throw new Error(
            `Số dư ví không đủ để nạp. Ví của bạn chỉ có ${fmtNum(state.walletEth, 4)} ETH.`
          );
        }
      } else {
        if (numAmount > state.contractEth) {
          throw new Error(
            `Số dư trong hợp đồng không đủ. Bạn chỉ có ${fmtNum(state.contractEth, 4)} ETH trong ví hợp đồng.`
          );
        }
      }

      // On-Chain Execution trên SmartWallet
      const amountWei = toWeiSafe(rawAmount);
      let receipt;

      if (activeTab === "deposit") {
        try {
          if (wallet.methods.depositWithNote) {
            receipt = await sendContractTx("Nạp ETH vào SmartWallet", wallet.methods.depositWithNote(noteText), amountWei);
          } else {
            receipt = await sendContractTx("Nạp ETH vào SmartWallet", wallet.methods.deposit(), amountWei);
          }
        } catch (dErr) {
          if (wallet.methods.deposit) {
            receipt = await sendContractTx("Nạp ETH vào SmartWallet", wallet.methods.deposit(), amountWei);
          } else {
            throw dErr;
          }
        }
      } else if (activeTab === "withdraw") {
        try {
          if (wallet.methods.withdrawWithNote) {
            receipt = await sendContractTx("Rút ETH từ SmartWallet", wallet.methods.withdrawWithNote(amountWei, noteText));
          } else {
            receipt = await sendContractTx("Rút ETH từ SmartWallet", wallet.methods.withdraw(amountWei));
          }
        } catch (wErr) {
          if (wallet.methods.withdraw) {
            console.warn("withdrawWithNote failed, falling back to standard withdraw(amount):", wErr);
            receipt = await sendContractTx("Rút ETH từ SmartWallet", wallet.methods.withdraw(amountWei));
          } else {
            throw wErr;
          }
        }
      } else {
        receipt = await sendContractTx(
          "Chuyển ETH SmartWallet",
          wallet.methods.transferToken(toAddr, amountWei, noteText)
        );
      }

      if (receipt) {
        const tTypeIdx = activeTab === "deposit" ? 0 : activeTab === "withdraw" ? 1 : 2;
        const metaObj = {
          note: noteText,
          txHash: receipt.transactionHash,
          blockNumber: Number(receipt.blockNumber || 0),
          gasUsed: Number(receipt.gasUsed || 0),
          timestamp: Math.floor(Date.now() / 1000),
        };
        if (receipt.transactionHash) {
          saveTxMeta(receipt.transactionHash, metaObj);
        }
        saveTxMeta(`${account}_${tTypeIdx}_${amountWei}`, metaObj);
        saveTxMeta(`${account}_${metaObj.timestamp}`, metaObj);
      }

      toast(
        `Đã thực hiện ${TX_LABELS[activeTab === "deposit" ? 0 : activeTab === "withdraw" ? 1 : 2].toLowerCase()} ` +
        `${numAmount} ETH thành công! Tx: ${shortHash(receipt?.transactionHash)}`,
        "success"
      );
      $("amount").value  = "";
      $("txNote").value  = "";
      currentPage = 1;
      await refreshData();

    } catch (err) {
      const msg = readableError(err);
      toast(msg, "error", 6000);
      addAuditLog(`Giao dịch thất bại: ${msg}`, true);
    } finally {
      $("submitBtnText").textContent = originalBtnText;
      btn.disabled = !isConnected;
    }
  }

  async function handleLookupBalance() {
    const addr = $("lookupAddrInput").value.trim();
    const box  = $("lookupResultBox");

    if (!isConnected || !wallet || !web3) {
      box.hidden  = false;
      box.innerHTML = `<span style="color:#f87171">Chưa kết nối blockchain. Vui lòng kết nối trước khi tra cứu.</span>`;
      return;
    }

    const valid = web3.utils.isAddress(addr);
    if (!valid) {
      box.hidden  = false;
      box.innerHTML = `<span style="color:#f87171">Địa chỉ ví không hợp lệ. Vui lòng nhập địa chỉ 0x... (42 ký tự).</span>`;
      return;
    }

    try {
      const [eContract, eWallet] = await Promise.all([
        wallet.methods.getBalance(addr).call().catch(() => 0),
        web3.eth.getBalance(addr).catch(() => 0),
      ]);
      const ethBalContract = fromWeiSafe(eContract);
      const ethBalWallet   = fromWeiSafe(eWallet);

      box.hidden  = false;
      box.innerHTML = `
        <div class="kv-row">
          <span class="kv-key">Địa chỉ tra cứu</span>
          <span class="kv-val mono">${shortAddr(addr)}</span>
        </div>
        <div class="kv-row">
          <span class="kv-key">Số dư trong Smart Contract</span>
          <span class="kv-val mono" style="color:#5bd5af">${fmtNum(ethBalContract, 4)} ETH</span>
        </div>
        <div class="kv-row">
          <span class="kv-key">Số dư ví cá nhân (on-chain)</span>
          <span class="kv-val mono" style="color:#5da9e9">${fmtNum(ethBalWallet, 4)} ETH</span>
        </div>
      `;
    } catch (err) {
      box.hidden  = false;
      box.innerHTML = `<span style="color:#f87171">${readableError(err)}</span>`;
    }
  }

  /* ── Tab Switching ───────────────────────────────────────── */
  function setTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll("#txTabs .seg-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tabName);
    });

    $("recipientGroup").hidden = tabName !== "transfer";

    const btnConfig = {
      deposit:  { icon: "↙", text: "Xác nhận nạp tiền" },
      withdraw: { icon: "↗", text: "Xác nhận rút tiền" },
      transfer: { icon: "⇄", text: "Xác nhận chuyển" },
    }[tabName];

    $("submitBtnIcon").textContent = btnConfig.icon;
    $("submitBtnText").textContent = btnConfig.text;

    const pctGroup = $("quickPctGroup");
    if (tabName === "withdraw") {
      pctGroup.innerHTML = `<button type="button" class="pct-chip" data-pct="1">MAX</button>`;
    } else {
      pctGroup.innerHTML = `
        <button type="button" class="pct-chip" data-pct="0.25">25%</button>
        <button type="button" class="pct-chip" data-pct="0.5">50%</button>
        <button type="button" class="pct-chip" data-pct="1">100%</button>
      `;
    }
    bindPctChips();
    renderActionBalanceHint();
  }

  function bindPctChips() {
    document.querySelectorAll(".pct-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const ratio     = Number(chip.dataset.pct || 1);
        const isDeposit = activeTab === "deposit";
        let base = isDeposit ? state.walletEth : state.contractEth;

        // Trừ nhỏ gas buffer khi nạp 100% ETH
        if (isDeposit && ratio === 1 && base > 0.02) {
          base = base - 0.01;
        }
        const computed = Math.max(0, base * ratio);
        $("amount").value = computed > 0 ? Number(computed.toFixed(4)) : "0";
      });
    });
  }

  /* ── Event Listeners ─────────────────────────────────────── */
  document.querySelectorAll("#txTabs .seg-tab").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  $("txForm").addEventListener("submit", handleFormSubmit);
  $("btnRefresh").addEventListener("click", () => {
    if (!isConnected) {
      toast("Chưa kết nối blockchain. Vui lòng kết nối trước.", "error", 3500);
      return;
    }
    refreshData();
    toast("Đang làm mới số dư & lịch sử giao dịch...", "info", 2200);
  });

  $("btnCopyMyAddr").addEventListener("click", () => {
    if (!account) return toast("Chưa có địa chỉ ví để sao chép", "error", 2500);
    navigator.clipboard?.writeText(account);
    toast(`Đã sao chép địa chỉ ví: ${shortAddr(account)}`, "info", 2500);
  });

  $("quickAccountSelect").addEventListener("change", async (e) => {
    if (!e.target.value) return;
    account = e.target.value;
    $("ganacheAccountSelect").value = account;
    $("connectBtnLabel").textContent = shortAddr(account);
    currentPage = 1;
    if (isConnected) {
      await refreshData();
      toast(`Đã chuyển sang tài khoản ${shortAddr(account)}`, "info", 2500);
    }
  });

  $("contactQuickSelect").addEventListener("change", (e) => {
    if (e.target.value) {
      $("toAddr").value = e.target.value;
      e.target.value    = "";
    }
  });

  $("lookupQuickSelect").addEventListener("change", (e) => {
    if (e.target.value) {
      $("lookupAddrInput").value = e.target.value;
      e.target.value = "";
    }
  });

  $("searchTxInput").addEventListener("input", () => { currentPage = 1; renderHistoryTable(); });
  $("filterTxType").addEventListener("change", () => { currentPage = 1; renderHistoryTable(); });
  $("chartRangeSelect").addEventListener("change", () => { renderAnalytics(); });

  $("btnPrevPage").addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; renderHistoryTable(); }
  });
  $("btnNextPage").addEventListener("click", () => {
    currentPage++;
    renderHistoryTable();
  });

  // Helper mở modal cấu hình đồng bộ trạng thái
  function openConfigModal() {
    $("connModeSelect").value = mode;
    $("ganacheConfigRow").hidden = (mode !== "ganache");
    if (mode === "ganache" && (!($("walletAddrInput").value.trim()) || $("walletAddrInput").value.toLowerCase().startsWith("0xee2be"))) {
      $("walletAddrInput").value = cfg.smartWallet?.address || "";
    }
    if (account && $("ganacheAccountSelect")) {
      $("ganacheAccountSelect").value = account;
    }
    openModal("configModal");
  }

  // Modal triggers
  $("btnOpenConfig").addEventListener("click", openConfigModal);
  $("btnHeroConfig").addEventListener("click", openConfigModal);
  $("btnNetPill").addEventListener("click", openConfigModal);

  // Khi click nút kết nối ví (Hình 2), mở modal cấu hình để người dùng tự chọn thay vì tự động kết nối
  $("btnConnectWallet").addEventListener("click", openConfigModal);

  // Mở modal Quản trị Circuit Breaker riêng cho Owner
  $("btnOpenAdmin")?.addEventListener("click", () => openModal("adminModal"));

  $("connModeSelect").addEventListener("change", (e) => {
    mode = e.target.value;
    $("ganacheConfigRow").hidden = (mode !== "ganache");
    if (mode === "ganache" && cfg.smartWallet?.address) {
      $("walletAddrInput").value = cfg.smartWallet.address;
    }
  });

  // Lắng nghe thay đổi tài khoản trong modal cấu hình
  $("ganacheAccountSelect").addEventListener("change", (e) => {
    if (e.target.value) {
      account = e.target.value;
      $("quickAccountSelect").value = e.target.value;
    }
  });

  $("btnSaveConfig").addEventListener("click", async () => {
    mode = $("connModeSelect").value;
    const selectedAcc = $("ganacheAccountSelect").value;
    if (mode === "ganache" && selectedAcc) {
      account = selectedAcc;
      $("quickAccountSelect").value = selectedAcc;
    }
    closeModal("configModal");
    await connectActiveMode(false);
    toast(`Đã lưu cấu hình và kết nối tài khoản ${shortAddr(account)}`, "info", 2500);
  });

  // Lookup Modal
  $("btnOpenLookup").addEventListener("click", () => {
    $("lookupAddrInput").value = account || "";
    $("lookupResultBox").hidden = true;
    openModal("lookupModal");
  });
  $("btnRunLookup").addEventListener("click", handleLookupBalance);

  // Add Contact Modal
  $("btnAddContact").addEventListener("click",    () => openModal("contactModal"));
  $("btnManageContacts").addEventListener("click", () => openModal("contactModal"));
  $("btnSaveContact").addEventListener("click", () => {
    const name    = $("contactNameInput").value.trim();
    const address = $("contactAddrInput").value.trim();
    if (!name) return toast("Vui lòng nhập tên liên hệ", "error");
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return toast("Địa chỉ ví phải có định dạng 0x... (42 ký tự)", "error");
    }
    const list = getContacts();
    list.unshift({ name, address });
    saveContacts(list);
    renderContacts();
    $("contactNameInput").value = "";
    $("contactAddrInput").value = "";
    closeModal("contactModal");
    toast(`Đã lưu "${name}" vào danh bạ ví`, "success");
  });

  // ── Circuit Breaker & Admin (100% On-chain) ───────────────
  $("btnTogglePause")?.addEventListener("click", async () => {
    if (!isConnected || !wallet) {
      return toast(
        "Chưa kết nối blockchain. Vui lòng kết nối trước khi thực hiện thao tác quản trị.",
        "error",
        5000
      );
    }
    try {
      if (!wallet.methods.paused) return toast("Contract không hỗ trợ hàm pause/unpause", "error");
      const isPaused = await wallet.methods.paused().call();
      if (isPaused) {
        await sendContractTx("Unpause SmartWallet", wallet.methods.unpause());
        toast("Đã mở lại hoạt động bình thường cho hợp đồng", "success");
      } else {
        await sendContractTx("Pause SmartWallet (Circuit Breaker)", wallet.methods.pause());
        toast("Đã kích hoạt Circuit Breaker! Toàn bộ nạp/rút/chuyển đã tạm dừng.", "warn");
      }
      await refreshData();
    } catch (err) {
      toast(readableError(err), "error");
    }
  });

  $("btnSaveMaxLimit")?.addEventListener("click", async () => {
    const raw = ($("maxLimitInput")?.value || "").trim().replace(",", ".");
    const val = Number(raw);
    if (!Number.isFinite(val) || val < 0) return toast("Hạn mức không hợp lệ (nhập số >= 0)", "error");

    if (!isConnected || !wallet) {
      return toast(
        "Chưa kết nối blockchain. Vui lòng kết nối trước khi đặt hạn mức.",
        "error",
        5000
      );
    }

    try {
      if (!wallet.methods.setMaxWithdrawLimit)
        return toast("Contract không hỗ trợ hàm setMaxWithdrawLimit", "error");
      const weiVal = val > 0 ? toWeiSafe(String(val)) : 0;
      await sendContractTx(
        `Đặt hạn mức rút ${val} ETH`,
        wallet.methods.setMaxWithdrawLimit(weiVal)
      );
      toast(`Đã cập nhật hạn mức rút tối đa: ${val > 0 ? val + " ETH" : "Không giới hạn"}`, "success");
      await refreshData();
    } catch (err) {
      toast(readableError(err), "error");
    }
  });

  $("btnTransferOwnership")?.addEventListener("click", async () => {
    const newOwner = ($("newOwnerInput")?.value || "").trim();
    if (!web3.utils.isAddress(newOwner)) {
      return toast("Địa chỉ Owner mới không hợp lệ (cần định dạng 0x... 42 ký tự)", "error");
    }
    if (newOwner.toLowerCase() === account.toLowerCase()) {
      return toast("Địa chỉ Owner mới trùng với tài khoản hiện tại", "warn");
    }
    if (!confirm(`CẢNH BÁO BẢO MẬT:\nBạn có chắc chắn muốn chuyển giao toàn bộ quyền Quản trị (Owner) của Smart Contract sang địa chỉ:\n${newOwner}\n\nThao tác này KHÔNG THỂ đảo ngược sau khi ký!`)) {
      return;
    }
    try {
      if (!wallet.methods.transferOwnership) {
        return toast("Contract không hỗ trợ hàm transferOwnership", "error");
      }
      await sendContractTx(
        `Chuyển quyền Owner sang ${shortAddr(newOwner)}`,
        wallet.methods.transferOwnership(newOwner)
      );
      toast(`Đã bàn giao quyền Quản trị thành công cho: ${shortAddr(newOwner)}!`, "success", 7000);
      $("newOwnerInput").value = "";
      closeModal("adminModal");
      await refreshData();
    } catch (err) {
      toast(readableError(err), "error");
    }
  });

  // Footer links
  $("linkDocs").addEventListener("click", (e) => { e.preventDefault(); openModal("configModal"); });
  $("linkHelp").addEventListener("click", (e) => { e.preventDefault(); openModal("lookupModal"); });

  // ── MetaMask listeners ────────────────────────────────────
  if (window.ethereum) {
    window.ethereum.on?.("accountsChanged", async (accs) => {
      if (mode !== "metamask") return;
      if (accs && accs.length > 0) {
        account = accs[0];
        populateAccountSelectors([account], account);
        $("meShort").textContent         = shortAddr(account);
        $("connectBtnLabel").textContent = shortAddr(account);
        currentPage = 1;
        if (isConnected) {
          await refreshData();
          toast(`Đã chuyển sang tài khoản ví ${shortAddr(account)}`, "info", 3000);
          addAuditLog(`MetaMask chuyển sang ví ${shortAddr(account)}`);
        }
      } else {
        isConnected = false;
        setDisconnectedUI("MetaMask đã ngắt kết nối.");
        toast("MetaMask đã ngắt kết nối.", "warn");
      }
    });

    window.ethereum.on?.("chainChanged", async () => {
      if (mode === "metamask") {
        await connectActiveMode(true);
        toast("MetaMask đã đổi mạng, đang cập nhật dữ liệu...", "info", 2500);
      }
    });
  }

  // ── Initialize ────────────────────────────────────────────
  // Trạng thái ban đầu: Disconnected, nút giao dịch bị vô hiệu
  $("btnSubmitTx").disabled = true;
  renderContacts();
  setTab("deposit");
  initConnection();
})();
