# SmartWallet DApp — Hợp đồng thông minh Quản lý Ví điện tử

> **Đồ án môn học: Lập trình Blockchain**
> **Đề tài:** Xây dựng hợp đồng thông minh quản lý ví điện tử đơn giản
> **Công nghệ:** Solidity · Remix IDE · Ganache · Web3.js · Hardhat

---

## 1. Phân tích yêu cầu

### 1.1 Bài toán đặt ra

Xây dựng một **ví điện tử phi tập trung** cho phép người dùng:
- Lưu trữ ETH an toàn trong Smart Contract trên blockchain Ethereum.
- Thực hiện các giao dịch tài chính cơ bản: nạp, rút, chuyển tiền.
- Tra cứu số dư và lịch sử giao dịch bất kỳ lúc nào, trực tiếp on-chain.
- Quản trị viên kiểm soát hệ thống qua cơ chế Circuit Breaker và hạn mức rút.

### 1.2 Yêu cầu chức năng

| ID | Chức năng | Mô tả |
|:---|:----------|:------|
| F-01 | **Nạp tiền** | Người dùng gửi ETH vào Smart Contract; số dư nội bộ được cập nhật tức thì |
| F-02 | **Rút tiền** | Người dùng rút ETH từ Smart Contract về ví cá nhân (EOA) |
| F-03 | **Chuyển tiền** | Chuyển số dư nội bộ giữa 2 người dùng trong hệ thống, kèm ghi chú |
| F-04 | **Kiểm tra số dư** | Tra cứu số dư ETH của bất kỳ địa chỉ nào trong hợp đồng |
| F-05 | **Lịch sử giao dịch** | Lưu và truy xuất toàn bộ lịch sử giao dịch on-chain |

### 1.3 Yêu cầu phi chức năng & Bảo mật

| Tiêu chí | Giải pháp áp dụng |
|:---------|:------------------|
| Chống Reentrancy | Modifier `nonReentrant` + Checks-Effects-Interactions |
| Chống Overflow | Compiler Solidity `^0.8.x` tự bảo vệ |
| Kiểm soát quyền | Modifier `onlyOwner` cho tất cả hàm quản trị |
| Dừng khẩn cấp | Circuit Breaker (`pause` / `unpause`) |
| Hạn mức rút | `maxWithdrawLimit` + Whitelist miễn trừ |
| Minh bạch | Mọi giao dịch phát `event` và ghi `Transaction[]` on-chain |

---

## 2. Kiến trúc hệ thống

### 2.1 Sơ đồ kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────────┐
│                     NGƯỜI DÙNG (Browser)                        │
│                                                                 │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │              Web3 DApp Frontend (HTML/CSS/JS)            │  │
│   │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │  │
│   │   │  Nạp     │  │  Rút     │  │  Chuyển  │  │ Lịch   │  │  │
│   │   │  tiền    │  │  tiền    │  │  tiền    │  │ sử GD  │  │  │
│   │   └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘  │  │
│   │        └─────────────┴──────────────┴────────────┘       │  │
│   │                           │                              │  │
│   │                    Web3.js / Provider                    │  │
│   └───────────────────────────┼──────────────────────────────┘  │
└───────────────────────────────┼─────────────────────────────────┘
                                │  JSON-RPC
        ┌───────────────────────┼───────────────────────────┐
        │                       ▼                           │
        │         BLOCKCHAIN (Ganache / Sepolia)             │
        │                                                   │
        │   ┌───────────────────────────────────────────┐   │
        │   │ SmartWallet.sol (is Ownable, Pausable,    │   │
        │   │                  ReentrancyGuard)         │   │
        │   │                                           │   │
        │   │  State Variables:                         │   │
        │   │  • mapping(address → uint256) balances    │   │
        │   │  • mapping tokenBalances (ERC-20)         │   │
        │   │  • Transaction[] transactions             │   │
        │   │  • address owner                         │   │
        │   │  • bool paused                           │   │
        │   │  • uint256 maxWithdrawLimit              │   │
        │   │                                           │   │
        │   │  Core Functions (ETH & ERC-20 Token):     │   │
        │   │  • deposit() / depositToken()             │   │
        │   │  • withdraw() / withdrawToken()           │   │
        │   │  • transferToken() / transferERC20()      │   │
        │   │  • getBalance() / balanceOf()             │   │
        │   │  • getTransactionHistory()                │   │
        │   │                                           │   │
        │   │  Admin Functions:                         │   │
        │   │  • pause() / unpause()   [onlyOwner]      │   │
        │   │  • setMaxWithdrawLimit() [onlyOwner]      │   │
        │   │  • setWhitelist()        [onlyOwner]      │   │
        │   └───────────────────────────────────────────┘   │
        │                                                   │
        └───────────────────────────────────────────────────┘
```

### 2.2 Luồng xử lý giao dịch Rút tiền (CEI Pattern)

```
Người dùng gọi withdraw(amount)
         │
         ▼
 [1. CHECKS]
  ├── amount > 0 ?                      ──✗──► revert "Withdraw amount must be > 0"
  ├── balances[user] >= amount ?        ──✗──► revert "Insufficient balance"
  └── amount <= maxLimit || whitelist ? ──✗──► revert "Amount exceeds max withdraw limit"
         │ ✓
         ▼
 [2. EFFECTS]  ← Cập nhật STATE TRƯỚC khi giao tiếp bên ngoài (chống Reentrancy)
  ├── balances[user] -= amount
  └── _recordTransaction("WITHDRAW", ...)
         │
         ▼
 [3. INTERACTIONS]  ← Giao tiếp ETH sau cùng
  └── payable(user).call{value: amount}("")
         │
         ├── success = true  ──► emit Withdrawn(user, amount, timestamp)
         └── success = false ──► revert "ETH transfer failed"
```

### 2.3 Cấu trúc thư mục

```
simple-wallet/
├── contracts/
│   ├── SmartWallet.sol              # Hợp đồng chính (Solidity ^0.8.19)
│   └── mocks/
│       └── ReentrancyAttacker.sol   # Hợp đồng giả lập tấn công Reentrancy
├── test/
│   ├── SmartWallet.test.js          # 14 test cases Hardhat (tự động)
│   ├── SmartWallet_RemixTest.sol    # 14 test cases Remix IDE (chạy thủ công)
│   └── SimpleWallet.test.js         # 19 test cases cho SimpleWallet
├── scripts/
│   ├── deploy.js                    # Deploy lên Ganache, sinh web/config.js
│   └── copy-web3.js                 # Sao chép web3.min.js vào thư mục web
├── web/
│   ├── index.html                   # Giao diện DApp
│   ├── style.css                    # Dark Theme Obsidian & Mint-Teal
│   ├── app.js                       # Logic Web3 (kết nối Ganache/MetaMask)
│   ├── config.js                    # Địa chỉ & ABI sinh tự động sau deploy
│   └── lib/web3.min.js              # Thư viện Web3.js client-side
├── server.js                        # Web server tĩnh tại http://localhost:5500
├── hardhat.config.js                # Cấu hình Hardhat + mạng Ganache
├── package.json                     # Dependencies và npm scripts
└── README.md                        # Tài liệu này
```

---

## 3. Kỹ thuật Solidity & Bảo mật

### 3.1 Bảng đối chiếu kỹ thuật bắt buộc

| Kỹ thuật | Vị trí trong code | Tác dụng |
|:---------|:-----------------|:---------|
| `struct Transaction` | Dòng 32–41 SmartWallet.sol | Định nghĩa kiểu dữ liệu giao dịch |
| `mapping(address → uint256)` | `balances`, `isWhitelisted` | Lưu số dư và danh sách whitelist |
| `modifier onlyOwner` | Bảo vệ tất cả hàm admin | Access Control — chỉ owner gọi được |
| `modifier nonReentrant` | `withdraw()`, `transferToken()` | Khóa hàm chống tấn công tái nhập |
| `modifier whenNotPaused` | `deposit()`, `withdraw()`, `transferToken()` | Circuit Breaker |
| `event Deposited/Withdrawn/Transferred` | Phát sau mỗi giao dịch thành công | On-chain audit log không thể sửa |
| **Checks-Effects-Interactions** | Thứ tự trong `withdraw()` | Ngăn Reentrancy kép |
| Solidity `^0.8.x` | `pragma solidity ^0.8.19` | Tự bảo vệ Overflow/Underflow |

### 3.2 Phòng chống Reentrancy (chi tiết)

SmartWallet áp dụng **bảo vệ kép**:

```solidity
// Lớp 1: nonReentrant modifier — khóa cờ trước khi thực thi
modifier nonReentrant() {
    require(_status != _ENTERED, "ReentrancyGuard reentrant call");
    _status = _ENTERED;
    _;
    _status = _NOT_ENTERED;
}

// Lớp 2: CEI trong withdraw() — trừ số dư TRƯỚC khi gửi ETH
function withdraw(uint256 _amount) external whenNotPaused nonReentrant {
    // CHECKS
    require(balances[msg.sender] >= _amount, "Insufficient balance");
    // EFFECTS ← state thay đổi trước
    balances[msg.sender] -= _amount;
    _recordTransaction(...);
    // INTERACTIONS ← ETH ra ngoài sau cùng
    (bool success,) = payable(msg.sender).call{value: _amount}("");
    require(success, "ETH transfer failed");
}
```

---

## 4. Hướng dẫn cài đặt & Chạy với Ganache

### 4.1 Yêu cầu môi trường

- **Node.js** ≥ 18.0.0
- **Ganache** (GUI: https://trufflesuite.com/ganache hoặc CLI)
- Trình duyệt Chrome/Brave/Edge (MetaMask tùy chọn)

### 4.2 Khởi chạy nhanh (3 terminal)

```bash
# Bước 0: Cài đặt dependencies
cd simple-wallet
npm install

# Bước 1 — Terminal 1: Chạy Ganache cục bộ
npm run ganache
# Kết quả: RPC http://127.0.0.1:7545 | Chain ID 1337 | 10 tài khoản × 100 ETH

# Bước 2 — Terminal 2: Biên dịch và deploy lên Ganache
npm run deploy
# Kết quả: in ra địa chỉ SmartWallet và tự ghi web/config.js

# Bước 3 — Terminal 3: Chạy Web Server DApp
npm run web
# Mở trình duyệt: http://localhost:5500

# (Tùy chọn) Chạy bộ test tự động Hardhat
npm test
# Kết quả: 33 test cases PASSED
```

### 4.3 Kết nối DApp với Ganache

1. Mở `http://localhost:5500` trên trình duyệt.
2. Nhấn nút **Cấu hình** (góc trên phải).
3. Chọn chế độ **"Ganache trực tiếp"**, RPC URL để mặc định `http://127.0.0.1:7545`.
4. Nhấn **"Lưu cấu hình & Kết nối"** — DApp tự động đọc 10 tài khoản từ Ganache.
5. Chọn tài khoản từ dropdown **"Địa chỉ ví"** để bắt đầu giao dịch.

---

## 5. Hướng dẫn triển khai lên Sepolia Testnet

> **Lưu ý:** Sepolia thay thế Goerli (đã ngừng hoạt động từ 2023). Mọi hướng dẫn testnet trong dự án này đều dùng **Sepolia**.

### 5.1 Chuẩn bị môi trường

**Bước 1 — Nhận ETH Sepolia miễn phí (Faucet)**

Truy cập một trong các faucet sau (cần tài khoản Google hoặc GitHub):
- https://sepoliafaucet.com (cấp 0.5 ETH/ngày)
- https://faucets.chain.link/sepolia (cấp 0.1 ETH)
- https://www.alchemy.com/faucets/ethereum-sepolia

**Bước 2 — Lấy RPC Endpoint Sepolia**

Đăng ký miễn phí tại https://www.alchemy.com hoặc https://infura.io:
- Tạo project → Chọn network **Ethereum Sepolia**
- Sao chép HTTPS endpoint, dạng:
  `https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY`

### 5.2 Triển khai bằng Remix IDE (Khuyến nghị cho đồ án)

**Bước 1 — Mở Remix IDE**

Truy cập https://remix.ethereum.org

**Bước 2 — Tải mã nguồn**

Tạo file mới trong Remix và dán nội dung từ `contracts/SmartWallet.sol`.

**Bước 3 — Biên dịch**

- Tab **"Solidity Compiler"**
- Compiler version: `0.8.19` (hoặc cao hơn)
- Advanced Configurations → **EVM Version: `paris`** *(quan trọng — tránh lỗi PUSH0 với một số node)*
- Nhấn **"Compile SmartWallet.sol"** → biểu tượng xanh ✓ là thành công

**Bước 4 — Cấu hình MetaMask cho Sepolia**

Mở MetaMask:
- Chọn mạng: **Sepolia Test Network** (có sẵn trong danh sách mặc định)
- Nếu không thấy: Settings → Advanced → Show test networks → ON

**Bước 5 — Deploy lên Sepolia**

- Tab **"Deploy & Run Transactions"**
- **Environment**: `Injected Provider - MetaMask`
- MetaMask hiện popup → Xác nhận chọn tài khoản Sepolia
- **Contract**: `SmartWallet`
- Nhấn nút cam **"Deploy"**
- MetaMask yêu cầu xác nhận gas fee → Nhấn **"Confirm"**
- Chờ ~15–30 giây → Contract xuất hiện trong mục **"Deployed Contracts"**

**Bước 6 — Lấy thông tin Contract**

```
Địa chỉ contract (Contract Address):
  → Copy từ mục "Deployed Contracts" (ví dụ: 0xAbCd...1234)

ABI của contract:
  → Tab "Solidity Compiler" → Nút "ABI" ở cuối trang → Copy toàn bộ JSON
```

**Bước 7 — Xác minh trên Etherscan Sepolia**

Truy cập https://sepolia.etherscan.io và tìm địa chỉ contract để kiểm tra:
- Transactions đã được ghi nhận
- Contract code (có thể verify source code để hiển thị công khai)

### 5.3 Kết nối DApp với Sepolia

Sau khi deploy lên Sepolia, cập nhật `web/config.js` thủ công:

```javascript
window.WALLET_CONFIG = {
  "chainId": 11155111,          // Chain ID Sepolia
  "rpcUrl": "https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY",
  "smartWallet": {
    "address": "0xDIA_CHI_CONTRACT_SEPOLIA",
    "abi": [ /* Dán ABI từ Remix IDE vào đây */ ]
  }
};
```

Mở DApp:
1. Nhấn **"Cấu hình"**
2. Chọn chế độ **"Ví MetaMask"**
3. MetaMask phải đang ở mạng Sepolia
4. Nhấn **"Lưu cấu hình & Kết nối"**

### 5.4 Bảng thông số mạng Sepolia

| Thông số | Giá trị |
|:---------|:--------|
| Tên mạng | Sepolia Test Network |
| Chain ID | `11155111` |
| RPC URL (Alchemy) | `https://eth-sepolia.g.alchemy.com/v2/<key>` |
| Block Explorer | https://sepolia.etherscan.io |
| Native Token | ETH (Sepolia) |
| Faucet | https://sepoliafaucet.com |

---

## 6. Bộ test cases kiểm thử

### 6.1 Test tự động (Hardhat — chạy `npm test`)

Tổng cộng **33 test cases** bao phủ toàn diện:

```
SmartWallet (14 tests)
  ✔ owner la nguoi deploy hop dong
  ✔ chi owner moi co the pause va unpause
  ✔ quan ly whitelist va han muc rut tien
  ✔ nap ETH bang deposit()
  ✔ nap ETH truc tiep qua receive()
  ✔ nap ETH qua fallback() khi co calldata
  ✔ tu choi nap 0 ETH
  ✔ khong the nap khi hop dong bi paused
  ✔ rut tien thanh cong, cap nhat so du va ghi lich su
  ✔ tu choi khi rut vuot qua so du
  ✔ chan rut vuot han muc maxWithdrawLimit neu khong trong whitelist
  ✔ chuyen tien thanh cong kem ghi chu
  ✔ tu choi khi tu chuyen cho chinh minh hoac dia chi 0
  ✔ getUserTransactions tra ve dung giao dich cua user

SmartWallet (16 tests)
  ✔ nap ETH tang so du va ghi lich su
  ... (19 tests)

33 passing
```

### 6.2 Test thủ công trên Remix IDE

File `test/SmartWallet_RemixTest.sol` chứa **14 test cases** chạy trực tiếp trong plugin **"Solidity Unit Testing"** của Remix IDE.

**Cách chạy:**
1. Mở https://remix.ethereum.org
2. Tải file `contracts/SmartWallet.sol` và `test/SmartWallet_RemixTest.sol`
3. Mở plugin **"Solidity Unit Testing"** (tab hình ngọn lửa thử nghiệm)
4. Chọn file `SmartWallet_RemixTest.sol` → Nhấn **"Run Tests"**

| Mã TC | Tên Test | Kịch bản |
|:-----:|:---------|:---------|
| TC-01 | `checkOwnerOnDeploy` | Khởi tạo đúng owner, paused=false, whitelist |
| TC-02 | `checkDepositSuccess` | Nạp ETH hợp lệ, số dư cập nhật đúng |
| TC-03 | `checkDepositRecordedInHistory` | Lịch sử ghi đúng loại DEPOSIT |
| TC-04 | `checkDepositZeroReverts` | Nạp 0 ETH → revert |
| TC-05 | `checkDepositBlockedWhenPaused` | Circuit Breaker chặn nạp khi paused |
| TC-06 | `checkWithdrawSuccess` | Rút ETH hợp lệ, số dư giảm đúng |
| TC-07 | `checkWithdrawExceedBalance` | Rút vượt số dư → revert |
| TC-08 | `checkWithdrawExceedMaxLimit` | Rút vượt hạn mức (non-whitelist) → revert |
| TC-09 | `checkWhitelistBypassesLimit` | Whitelist rút vượt hạn mức → thành công |
| TC-10 | `checkTransferTokenSuccess` | Chuyển nội bộ, cả 2 bên cập nhật đúng |
| TC-11 | `checkTransferToZeroReverts` | Chuyển tới address(0) → revert |
| TC-12 | `checkTransferToSelfReverts` | Tự chuyển cho mình → revert |
| TC-13 | `checkOnlyOwnerCanPause` | Non-owner gọi pause() → revert |
| TC-14 | `checkGetBalanceAccuracy` | getBalance đúng qua nhiều thao tác |

---

## 7. Bảng phân tích bảo mật Smart Contract

| Loại tấn công / Lỗ hổng | Biện pháp phòng chống | Vị trí trong code |
|:------------------------|:---------------------|:------------------|
| **Reentrancy** | Modifier `nonReentrant` + CEI strict | `withdraw()`, `transferToken()` |
| **Integer Overflow** | Compiler Solidity `^0.8.x` tự revert | Toàn bộ phép tính số học |
| **Unauthorized Access** | Modifier `onlyOwner` | `pause()`, `unpause()`, `setMaxWithdrawLimit()`, `setWhitelist()`, `transferOwnership()` |
| **Rút ETH về 0x0** | `require(_to != address(0))` | `transferToken()` |
| **Tự chuyển** | `require(_to != msg.sender)` | `transferToken()` |
| **Rút số âm / 0** | `require(_amount > 0)` | `deposit()`, `withdraw()`, `transferToken()` |
| **Rút vượt số dư** | `require(balances[user] >= amount)` | `withdraw()`, `transferToken()` |
| **Rút vượt hạn mức** | `maxWithdrawLimit` + Whitelist | `withdraw()` |
| **Tấn công hệ thống** | Circuit Breaker `pause()` | Dừng khẩn cấp toàn bộ giao dịch |
| **Mất tài sản khi ETH transfer lỗi** | `require(success, ...)` | `withdraw()` |

---

## 8. npm Scripts

```bash
npm test          # Chạy 33 unit tests (Hardhat + Chai)
npm run ganache   # Khởi động Ganache cục bộ (port 7545, chainId 1337)
npm run deploy    # Compile + deploy lên Ganache → ghi web/config.js
npm run web       # Khởi động web server tĩnh tại http://localhost:5500
npm run compile   # Chỉ compile Solidity (không deploy)
```

---

## 9. Lưu ý quan trọng

> [!IMPORTANT]
> Sau khi khởi động lại Ganache, địa chỉ hợp đồng **sẽ thay đổi**. Phải chạy lại `npm run deploy` để cập nhật `web/config.js`.

> [!NOTE]
> MetaMask cần được cấu hình đúng mạng Ganache (Chain ID `1337`, RPC `http://127.0.0.1:7545`) hoặc Sepolia (Chain ID `11155111`) trước khi kết nối DApp.

> [!WARNING]
> Không dùng private key tài khoản thật (Mainnet) trên Ganache hoặc bất kỳ môi trường testnet nào. Chỉ dùng các tài khoản thử nghiệm do Ganache sinh ra.
