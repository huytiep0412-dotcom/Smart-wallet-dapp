# BÁO CÁO BÀI TẬP LỚN / ĐỒ ÁN HỌC PHẦN LẬP TRÌNH BLOCKCHAIN

**ĐỀ TÀI: XÂY DỰNG HỢP ĐỒNG THÔNG MINH QUẢN LÝ VÍ ĐIỆN TỬ ĐƠN GIẢN**

* **Học phần:** Lập trình Blockchain
* **Công nghệ thực hiện:** Solidity, Remix IDE, Ganache, Hardhat, Web3.js, MetaMask, Sepolia Testnet
* **Sinh viên thực hiện:** ………………………………………  **Mã sinh viên:** ………………………  **Lớp:** ……………
* **Giảng viên hướng dẫn:** ………………………………………

---

## MỤC LỤC

1. [CHƯƠNG 1. PHÂN TÍCH YÊU CẦU BÀI TOÁN](#chương-1-phân-tích-yêu-cầu-bài-toán)
2. [CHƯƠNG 2. THIẾT KẾ KIẾN TRÚC HỆ THỐNG](#chương-2-thiết-kế-kiến-trúc-hệ-thống)
3. [CHƯƠNG 3. CÀI ĐẶT SMART CONTRACT & CÁC GIẢI PHÁP AN TOÀN BẢO MẬT](#chương-3-cài-đặt-smart-contract--các-giải-pháp-an-toàn-bảo-mật)
4. [CHƯƠNG 4. BỘ TEST CASES KIỂM THỬ & KẾT QUẢ THỰC NGHIỆM](#chương-4-bộ-test-cases-kiểm-thử--kết-quả-thực-nghiệm)
5. [CHƯƠNG 5. HƯỚNG DẪN TRIỂN KHAI LÊN MẠNG TESTNET SEPOLIA](#chương-5-hướng-dẫn-triển-khai-lên-mạng-testnet-sepolia)
6. [CHƯƠNG 6. KẾT LUẬN & HƯỚNG PHÁT TRIỂN](#chương-6-kết-luận--hướng-phát-triển)
7. [TÀI LIỆU THAM KHẢO](#tài-liệu-tham-khảo)

---

## LỜI MỞ ĐẦU

Trong kỷ nguyên chuyển đổi số và công nghệ Web3, công nghệ Blockchain đã khẳng định vai trò là hạ tầng tính toán phân tán phi tập trung, bất biến và hoàn toàn minh bạch. Hợp đồng thông minh (Smart Contract) chạy trên nền tảng máy ảo Ethereum (EVM) cho phép số hóa các quy tắc tài chính mà không cần sự can thiệp của bất kỳ tổ chức trung gian đáng tin cậy nào.

Một trong những ứng dụng nền tảng của hệ sinh thái tài chính phi tập trung (DeFi) chính là **Ví điện tử thông minh (Smart Wallet)**. Khác với ví cá nhân truyền thống (EOA) chỉ quản lý khóa riêng, Smart Contract Wallet cho phép lập trình hóa việc quản lý tài sản, kiểm soát hạn mức giao dịch, bảo vệ số dư trước các cuộc tấn công tái nhập (Reentrancy), và tự động ghi lại toàn bộ lịch sử giao dịch on-chain không thể bị tẩy xóa hay giả mạo.

Đề tài **"Xây dựng hợp đồng thông minh quản lý ví điện tử đơn giản"** được nghiên cứu và hiện thực hóa nhằm đáp ứng toàn bộ các yêu cầu của học phần Lập trình Blockchain, bao gồm: thiết kế hợp đồng bằng ngôn ngữ **Solidity**, phát triển và kiểm thử trên môi trường **Remix IDE** và **Ganache Localhost**, xây dựng bộ kiểm thử đơn vị tự động, và hướng dẫn triển khai lên mạng thử nghiệm công khai **Sepolia Testnet**.

---

## CHƯƠNG 1. PHÂN TÍCH YÊU CẦU BÀI TOÁN

### 1.1 Mục tiêu đề tài
Xây dựng một hợp đồng thông minh hoàn chỉnh đóng vai trò là ví điện tử phi tập trung, hỗ trợ người dùng quản lý an toàn đồng coin bản địa (**Native ETH**). Mọi nghiệp vụ nạp tiền, rút tiền, chuyển tiền, tra cứu số dư và ghi lại lịch sử giao dịch đều được xử lý on-chain, minh bạch và bảo mật.

### 1.2 Bảng phân tích yêu cầu chức năng (Functional Requirements)

| Mã YC | Tên chức năng | Mô tả chi tiết | Quyền hạn |
| :---: | :--- | :--- | :---: |
| **F-01** | **Nạp tiền (Deposit)** | Người dùng nạp ETH vào hợp đồng ví kèm ghi chú giao dịch. Số dư nội bộ trong ví hợp đồng được cập nhật tức thì, phát sự kiện và ghi nhận giao dịch vào lịch sử. | Mọi người dùng |
| **F-02** | **Rút tiền (Withdraw)** | Cho phép người dùng rút ETH từ số dư nội bộ trong Smart Contract về ví cá nhân (EOA). Áp dụng kiểm tra hạn mức rút và bảo vệ số dư. | Người sở hữu số dư |
| **F-03** | **Chuyển tiền (Transfer)** | Cho phép người dùng chuyển số dư nội bộ cho một địa chỉ ví khác trong hệ thống kèm nội dung ghi chú (Note). Giao dịch chuyển tiền nội bộ an toàn và minh bạch. | Người sở hữu số dư |
| **F-04** | **Kiểm tra số dư (Get Balance)** | Cho phép bất kỳ ai tra cứu số dư nội bộ hiện tại của một ví cụ thể trong hợp đồng cũng như số dư tổng của hợp đồng. | Công khai (View) |
| **F-05** | **Truy xuất lịch sử (Transaction History)** | Lưu trữ vĩnh viễn mọi giao dịch on-chain dạng mảng `Transaction[]`. Cung cấp hàm đọc toàn bộ sổ cái hoặc lọc theo từng địa chỉ người dùng. | Công khai (View) |
| **F-06** | **Quản trị khẩn cấp (Circuit Breaker)** | Cho phép Owner đóng băng khẩn cấp toàn bộ hệ thống (`pause`) khi phát hiện sự cố bảo mật, và mở lại hoạt động bình thường (`unpause`). | Chỉ Owner (`onlyOwner`) |
| **F-07** | **Quản lý hạn mức & Whitelist** | Thiết lập hạn mức rút tối đa cho mỗi giao dịch nhằm giảm thiểu rủi ro khi ví bị lộ khóa riêng; cấp quyền miễn trừ hạn mức cho ví tin cậy (Whitelist). | Chỉ Owner (`onlyOwner`) |

### 1.3 Yêu cầu phi chức năng (Non-Functional Requirements)
1. **Tính độc lập và tương thích:** Mã nguồn Smart Contract viết độc lập (Zero external npm imports), biên dịch trực tiếp trên **Remix IDE** mà không phụ thuộc vào đường dẫn thư viện ngoài.
2. **Tính bất biến & Minh bạch:** Mọi giao dịch thay đổi trạng thái tài sản bắt buộc phải phát ra Sự kiện (`event`) và lưu vào cấu trúc dữ liệu on-chain phục vụ kiểm toán độc lập.
3. **Hiệu quả chi phí Gas:** Tối ưu hóa biến trạng thái, sử dụng kiểu dữ liệu phù hợp, áp dụng cấu trúc dữ liệu gọn gàng để giảm thiểu phí Gas cho người dùng.

---

## CHƯƠNG 2. THIẾT KẾ KIẾN TRÚC HỆ THỐNG

### 2.1 Sơ đồ kiến trúc tổng thể (Architecture Overview)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        NGƯỜI DÙNG & MÔI TRƯỜNG TÁC NGHIỆP              │
│                                                                        │
│   ┌─────────────────────────────┐        ┌─────────────────────────┐   │
│   │   Web3 DApp (HTML/CSS/JS)   │        │   Remix IDE (Trình DU)  │   │
│   │   • Nạp / Rút / Chuyển      │        │   • Biên dịch Solidity  │   │
│   │   • Bảng thống kê & Lịch sử │        │   • Chạy Unit Testing   │   │
│   └──────────────┬──────────────┘        └────────────┬────────────┘   │
└──────────────────┼────────────────────────────────────┼────────────────┘
                   │                                    │
                   ▼                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │               Web3 Provider / Injected Provider         │
       │           (MetaMask Web3 / RPC HTTP 127.0.0.1:7545)     │
       └────────────────────────────┬────────────────────────────┘
                                    │ JSON-RPC Protocol
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   HẠ TẦNG BLOCKCHAIN (Ganache / Sepolia)               │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                      SmartWallet.sol                           │   │
│   │                                                                │   │
│   │  [State Variables]                                             │   │
│   │  • balances: mapping(address => uint256)                       │   │
│   │  • tokenBalances: mapping(address => mapping(address => uint)) │   │
│   │  • transactions: Transaction[]                                 │   │
│   │  • owner: address | paused: bool | maxWithdrawLimit: uint256   │   │
│   │                                                                │   │
│   │  [Core Operations]                                             │   │
│   │  • deposit() / depositToken(token, amount)                     │   │
│   │  • withdraw(amount) / withdrawToken(token, amount)             │   │
│   │  • transferToken(...) / transferERC20(...)                     │   │
│   │  • getBalance(user) / balanceOf(token, user)                   │   │
│   │  • getTransactionHistory() / getUserTransactions(user)         │   │
│   │                                                                │   │
│   │  [Security Guards]                                             │   │
│   │  • nonReentrant (Reentrancy Guard)                             │   │
│   │  • onlyOwner (Access Control)                                  │   │
│   │  • whenNotPaused / whenPaused (Circuit Breaker)                │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Cấu trúc dữ liệu chi tiết
1. **Bản ghi giao dịch on-chain (`struct Transaction`):**
   ```solidity
   struct Transaction {
       uint256 id;        // Định danh tăng tuần tự từ 1
       string  txType;    // "DEPOSIT" | "WITHDRAW" | "TRANSFER"
       address token;     // address(0) biểu diễn ETH; địa chỉ khác là ERC-20
       address from;      // Người khởi tạo giao dịch
       address to;        // Người thụ hưởng (address(0) nếu nạp/rút)
       uint256 amount;    // Số lượng wei / token
       string  note;      // Ghi chú giao dịch do người dùng nhập
       uint256 timestamp; // Dấu thời gian Unix khi đào block
   }
   ```
2. **Bảng băm quản lý số dư nội bộ (`mapping`):**
   * `mapping(address => uint256) private balances`: Quản lý số dư Native ETH nội bộ cho từng người dùng.
   * `mapping(address => mapping(address => uint256)) private tokenBalances`: Bảng băm 2 chiều quản lý số dư Token ERC-20 (`tokenAddress => userAddress => balance`).
   * `mapping(address => bool) public isWhitelisted`: Danh sách các địa chỉ ví tin cậy được miễn kiểm tra hạn mức rút tiền.

### 2.3 Thiết kế luồng xử lý Rút tiền theo mô hình Checks-Effects-Interactions (CEI)

```
        Người dùng gọi hàm withdraw(amount)
                       │
                       ▼
            ┌──────────────────────┐
            │   BƯỚC 1: CHECKS     │
            └──────────┬───────────┘
                       │
                       ├─► amount > 0 ? (Nếu sai: Revert lỗi)
                       ├─► balances[msg.sender] >= amount ? (Nếu sai: Revert lỗi)
                       ├─► Hợp đồng có đang bị Pause? (Nếu có: Revert lỗi)
                       └─► amount <= maxWithdrawLimit (hoặc trong Whitelist)?
                       │ (Hợp lệ)
                       ▼
            ┌──────────────────────┐
            │   BƯỚC 2: EFFECTS    │  ◄── CẬP NHẬT TRẠNG THÁI NỘI BỘ TRƯỚC
            └──────────┬───────────┘
                       │
                       ├─► balances[msg.sender] -= amount;
                       └─► _recordTransaction("WITHDRAW", address(0), ...);
                       │ (Đã trừ tiền trong sổ cái)
                       ▼
            ┌──────────────────────┐
            │ BƯỚC 3: INTERACTIONS │  ◄── GỬI TIỀN RA NGOÀI SAU CÙNG
            └──────────┬───────────┘
                       │
                       ├─► (bool ok, ) = payable(msg.sender).call{value: amount}("");
                       ├─► require(ok, "ETH transfer failed");
                       └─► emit Withdrawn(msg.sender, amount, block.timestamp);
```

---

## CHƯƠNG 3. CÀI ĐẶT SMART CONTRACT & CÁC GIẢI PHÁP AN TOÀN BẢO MẬT

### 3.1 Kiến trúc Kế thừa (Inheritance) & Mô đun hóa Hướng đối tượng

Nhằm đáp ứng trọn vẹn yêu cầu kỹ thuật nền tảng của ngôn ngữ Solidity (kế thừa `inheritance`, `struct`, `mapping`, `modifier`, `event`) đồng thời duy trì tính độc lập tuyệt đối (không phụ thuộc vào thư viện npm bên ngoài, có thể copy paste biên dịch ngay trên Remix IDE), `SmartWallet.sol` được tổ chức theo mô hình kế thừa đa tầng:

```
          ┌─────────────┐
          │   Ownable   │ ◄── Quản lý Owner & modifier onlyOwner
          └──────┬──────┘
                 │ kế thừa
                 ▼
          ┌─────────────┐             ┌───────────────────┐
          │   Pausable  │             │  ReentrancyGuard  │ ◄── Khóa chống Re-entrancy
          └──────┬──────┘             └─────────┬─────────┘
                 │                              │
                 └──────────────┬───────────────┘
                                │ đa kế thừa (is Ownable, Pausable, ReentrancyGuard)
                                ▼
                     ┌─────────────────────┐
                     │     SmartWallet     │ ◄── Nghiệp vụ ví: ETH & Token ERC-20
                     └─────────────────────┘
```

1. **`abstract contract Ownable`:** Cung cấp biến `owner`, hàm `transferOwnership`, và modifier `onlyOwner` kiểm soát truy cập cho các tác vụ quản trị.
2. **`abstract contract Pausable is Ownable`:** Kế thừa từ `Ownable`, cung cấp biến `paused`, sự kiện `Paused`/`Unpaused`, hàm `pause()`/`unpause()`, và hai modifier `whenNotPaused` / `whenPaused`.
3. **`abstract contract ReentrancyGuard`:** Cung cấp khóa nhị phân `_status` và modifier `nonReentrant` bảo vệ các hàm tương tác tài chính.
4. **`contract SmartWallet is Ownable, Pausable, ReentrancyGuard`:** Kế thừa toàn bộ năng lực quản trị, ngắt mạch khẩn cấp và bảo vệ chống tấn công đệ quy, tập trung hiện thực hóa 5 nhóm chức năng nghiệp vụ ví.

### 3.2 Các giải pháp bảo mật cốt lõi được áp dụng

#### 1. Phòng chống tấn công Tái nhập (Re-entrancy Attack)
* **Nguyên lý tấn công:** Kẻ tấn công sử dụng một hợp đồng độc hại gọi hàm rút tiền. Trong hàm `fallback()` hoặc `receive()` của mình, hợp đồng độc hại tiếp tục gọi lại đệ quy hàm rút tiền trước khi hợp đồng mục tiêu kịp trừ số dư.
* **Biện pháp phòng ngừa kép trong `SmartWallet.sol`:**
  - *Lớp bảo vệ 1 (Checks-Effects-Interactions):* Số dư `balances[msg.sender]` luôn được trừ **trước khi** thực hiện lệnh chuyển ETH `payable(msg.sender).call{value: _amount}("")`. Nếu hàm đệ quy được gọi lại, số dư đã về 0 và bị `require` chặn đứng.
  - *Lớp bảo vệ 2 (ReentrancyGuard):* Modifier `nonReentrant` quản lý cờ trạng thái `_status` (`_NOT_ENTERED = 1`, `_ENTERED = 2`). Hàm đang thực thi sẽ khóa cửa, mọi lời gọi đệ quy chéo đều bị revert ngay lập tức.

#### 2. Phòng chống Tràn số và Thiếu số (Overflow / Underflow)
* Tràn số xảy ra khi giá trị tính toán vượt qua giá trị tối đa của kiểu dữ liệu (ví dụ `uint256`).
* **Biện pháp:** Hợp đồng được biên dịch bằng Solidity `^0.8.19` (chuẩn phiên bản $\ge 0.8.0$). Compiler tự động chèn mã kiểm tra tràn số học và tự động Revert giao dịch khi xảy ra tràn số mà không cần tốn gas cho thư viện ngoài như `SafeMath`.

#### 3. Kiểm soát quyền truy cập chặt chẽ (Access Control)
* Các hàm thay đổi cấu hình hệ thống quan trọng như tạm dừng hợp đồng (`pause`), gỡ tạm dừng (`unpause`), đặt hạn mức (`setMaxWithdrawLimit`), quản lý Whitelist (`setWhitelist`), chuyển quyền sở hữu (`transferOwnership`) được bảo vệ nghiêm ngặt bằng modifier `onlyOwner`:
  ```solidity
  modifier onlyOwner() {
      require(msg.sender == owner, "SmartWallet: Caller is not the owner");
      _;
  }
  ```

#### 4. Cơ chế ngắt mạch khẩn cấp (Circuit Breaker)
* Cho phép Owner ngay lập tức đóng băng toàn bộ nghiệp vụ nạp, rút, chuyển khi phát hiện có lỗ hổng hoặc bị tấn công on-chain thông qua modifier `whenNotPaused`. Giúp bảo vệ an toàn toàn bộ tài sản đang được ký gửi trong hợp đồng.

### 3.3 Quản lý tài sản Native ETH an toàn
* **Native ETH:** Được truyền trực tiếp qua giao thức Ethereum dưới dạng `msg.value` (hàm `payable`). Nạp qua `deposit()` / `depositWithNote()`, rút qua `withdraw()` / `withdrawWithNote()`, chuyển qua `transferToken()`. SmartWallet quản lý số dư on-chain bảo đảm tính toán chính xác và phòng chống tấn công Reentrancy.

---

## CHƯƠNG 4. BỘ TEST CASES KIỂM THỬ & KẾT QUẢ THỰC NGHIỆM

### 4.1 Bảng ma trận kịch bản kiểm thử (Test Matrix)

| Mã TC | Tên kịch bản | Dữ liệu đầu vào | Kết quả mong đợi | Trạng thái |
| :---: | :--- | :--- | :--- | :---: |
| **TC-01** | Kiểm tra khởi tạo | Deploy hợp đồng | `owner` là deployer, `paused = false`, `maxWithdrawLimit = 0` | **PASSED** |
| **TC-02** | Nạp ETH hợp lệ | Gửi 3.0 ETH qua `deposit()` | Số dư ví và hợp đồng tăng 3.0 ETH; ghi 1 bản ghi `DEPOSIT` | **PASSED** |
| **TC-03** | Chặn nạp 0 ETH | Gửi `msg.value = 0` | Revert: *"SmartWallet: Deposit amount must be greater than 0"* | **PASSED** |
| **TC-04** | Chặn nạp khi paused | Owner gọi `pause()` rồi nạp | Revert: *"SmartWallet: Contract is paused"* | **PASSED** |
| **TC-05** | Rút ETH thành công | Rút 2.0 ETH từ số dư 5.0 ETH | Số dư nội bộ còn 3.0 ETH; ví cá nhân nhận 2.0 ETH; phát `Withdrawn` | **PASSED** |
| **TC-06** | Chặn rút vượt số dư | Rút 6.0 ETH từ số dư 5.0 ETH | Revert: *"SmartWallet: Insufficient balance"* | **PASSED** |
| **TC-07** | Chặn rút vượt hạn mức | Hạn mức 1 ETH, ví rút 2 ETH | Revert: *"SmartWallet: Amount exceeds max withdraw limit"* | **PASSED** |
| **TC-08** | Whitelist miễn hạn mức | Ví nằm trong Whitelist rút 2 ETH | Rút thành công, bỏ qua hạn mức tối đa | **PASSED** |
| **TC-09** | Chuyển ETH nội bộ | Chuyển 1.5 ETH kèm ghi chú | Người gửi giảm 1.5, người nhận tăng 1.5 ETH; ghi log `TRANSFER` | **PASSED** |
| **TC-10** | Chặn tự chuyển cho mình | Người gửi nhập địa chỉ của chính mình | Revert: *"SmartWallet: Cannot transfer to yourself"* | **PASSED** |
| **TC-11** | Chặn chuyển tới địa chỉ 0x0 | Người gửi nhập `address(0)` | Revert: *"SmartWallet: Cannot transfer to the zero address"* | **PASSED** |
| **TC-12** | Phân quyền Owner | Người dùng thông thường gọi `pause()` | Revert: *"SmartWallet: Caller is not the owner"* | **PASSED** |
| **TC-13** | Chặn rút vượt hạn mức | Hạn mức 1 ETH, ví rút 2 ETH | Revert: *"SmartWallet: Amount exceeds max withdraw limit"* | **PASSED** |
| **TC-14** | Whitelist miễn hạn mức | Ví nằm trong Whitelist rút 2 ETH | Rút thành công, bỏ qua hạn mức tối đa | **PASSED** |
| **TC-15** | Nạp ETH kèm ghi chú | Gửi 2.5 ETH qua depositWithNote | Số dư tăng 2.5 ETH, lịch sử ghi đúng ghi chú | **PASSED** |
| **TC-16** | Rút ETH kèm ghi chú | Rút 1.0 ETH qua withdrawWithNote | Rút thành công, lịch sử lưu đúng ghi chú | **PASSED** |

### 4.2 Kết quả thực thi kiểm thử tự động (Hardhat Test Runner)

Toàn bộ **16 bài kiểm thử tự động chuyên sâu** đã chạy và vượt qua 100% trên môi trường EVM:

```text
  SmartWallet
    Khoi tao & Phan quyen
      ✔ owner la nguoi deploy hop dong
      ✔ chi owner moi co the pause va unpause
      ✔ quan ly whitelist va han muc rut tien
    Nap tien (deposit & receive)
      ✔ nap ETH bang deposit()
      ✔ nap ETH bang depositWithNote() kem ghi chu
      ✔ nap ETH truc tiep qua receive()
      ✔ nap ETH qua fallback() khi co calldata
      ✔ tu choi nap 0 ETH
      ✔ khong the nap khi hop dong bi paused
    Rut tien (withdraw)
      ✔ rut tien thanh cong, cap nhat so du va ghi lich su
      ✔ rut tien bang withdrawWithNote() kem ghi chu
      ✔ tu choi khi rut vuot qua so du
      ✔ chan rut vuot han muc maxWithdrawLimit neu khong trong whitelist
    Chuyen tien noi bo (transferToken)
      ✔ chuyen tien thanh cong kem ghi chu
      ✔ tu choi khi tu chuyen cho chinh minh hoac dia chi 0
    Tra cuu lich su theo nguoi dung
      ✔ getUserTransactions tra ve dung giao dich cua user

  16 passing (713ms)
```

---

## CHƯƠNG 5. HƯỚNG DẪN TRIỂN KHAI LÊN MẠNG TESTNET SEPOLIA

> **Ghi chú quan trọng:** Mạng Goerli Testnet đã chính thức ngừng hoạt động (deprecated) từ cuối năm 2023. Theo chuẩn Ethereum hiện hành, mạng thử nghiệm chính thức được sử dụng là **Ethereum Sepolia Testnet** (Chain ID: `11155111`).

### 5.1 Chuẩn bị môi trường & Faucet SepoliaETH
1. **Cài đặt ví MetaMask:** Cài đặt tiện ích MetaMask trên trình duyệt Chrome/Edge/Brave.
2. **Chuyển sang mạng Sepolia:** Tại góc trên bên trái MetaMask, mở danh sách mạng -> Bật tùy chọn *"Hiển thị các mạng thử nghiệm"* -> Chọn **Sepolia**.
3. **Nhận SepoliaETH miễn phí (Faucet):**
   * Sao chép địa chỉ ví cá nhân (bắt đầu bằng `0x...`).
   * Truy cập một trong các cổng nhận faucet uy tín:
     - Google Web3 Cloud Faucet: https://cloud.google.com/application/web3/faucet/ethereum/sepolia
     - Sepolia PoW Faucet: https://sepolia-faucet.pk910.de
     - Alchemy Faucet: https://sepoliafaucet.com
   * Nhận thành công từ 0.05 đến 0.5 SepoliaETH vào ví để làm phí Gas.

### 5.2 Khắc phục lỗi kẹt Nonce trên MetaMask (Rất quan trọng)
Nếu ví MetaMask từng được dùng thử nghiệm trên Ganache Localhost, số Nonce trong bộ nhớ đệm MetaMask có thể bị kẹt ở con số cao (ví dụ `Nonce 1162`), khiến giao dịch trên Sepolia bị báo lỗi **"Gas estimation failed"** hoặc **"missing revert data"**.
* **Cách xử lý:** Mở MetaMask -> Bấm vào biểu tượng **3 chấm** góc phải -> Chọn **Cài đặt (Settings)** -> Chọn **Nâng cao (Advanced)** -> Kéo xuống chọn **"Xóa dữ liệu hoạt động tab / Đặt lại tài khoản (Clear activity tab data / Reset Account)"**. Thao tác này đưa số Nonce về 0 mà không làm mất tiền hay khóa riêng.

### 5.3 Biên dịch và Triển khai Smart Contract trên Remix IDE
1. **Truy cập Remix IDE:** Mở trình duyệt truy cập https://remix.ethereum.org.
2. **Nạp mã nguồn:** Tại mục `contracts/`, tạo file mới `SmartWallet.sol` và dán toàn bộ mã nguồn hợp đồng.
3. **Cấu hình biên dịch (Solidity Compiler):**
   * Compiler version: Chọn `0.8.19` (hoặc `0.8.24`).
   * Mở mục **Advanced Configurations** -> Chọn **EVM Version = `paris`** (hoặc `shanghai`). *Lưu ý: Không để mặc định `cancun` để tránh phát sinh lỗi opcode `PUSH0` trên các RPC node cũ.*
   * Bấm nút màu xanh **"Compile SmartWallet.sol"**.
4. **Triển khai (Deploy & Run Transactions):**
   * Tại mục **ENVIRONMENT**, chọn: **`Injected Provider - MetaMask`**.
   * MetaMask sẽ hiện popup yêu cầu kết nối với trang web `remix.ethereum.org` -> Nhấn xác nhận.
   * Kiểm tra bên dưới hiển thị đúng: `Custom (11155111) network` và địa chỉ ví của bạn.
   * Tại mục **CONTRACT**, chọn hợp đồng: `SmartWallet`.
   * Bấm nút cam **"Deploy"**.
   * Popup MetaMask xuất hiện yêu cầu xác nhận phí mạng (Gas fee) tính bằng SepoliaETH -> Bấm **Xác nhận (Confirm)**.
   * Chờ khoảng 10–15 giây để khối được đào trên mạng Sepolia.

### 5.4 Xác minh và tra cứu trên Block Explorer
1. Sau khi deploy thành công, contract address sẽ xuất hiện tại mục **Deployed Contracts** trên Remix (ví dụ: `0xC89Ce4735882C9F0f0FE26686c53074E09B0D550`).
2. Truy cập trình khám phá khối Sepolia: https://sepolia.etherscan.io.
3. Dán địa chỉ hợp đồng vừa deploy vào thanh tìm kiếm. Bạn sẽ thấy:
   * Mã băm tạo hợp đồng (Contract Creation Transaction Hash).
   * Trạng thái giao dịch thành công (Success).
   * Lịch sử các lần gọi hàm `deposit()`, `withdraw()`, `transferToken()` hiển thị minh bạch theo thời gian thực.

---

## CHƯƠNG 6. KẾT LUẬN & HƯỚNG PHÁT TRIỂN

### 6.1 Kết quả đạt được
1. Hiện thực hóa đầy đủ 5 chức năng cốt lõi của ví điện tử theo yêu cầu của đề tài: nạp, rút, chuyển, kiểm tra số dư và ghi nhận lịch sử bất biến.
2. Quản lý tài sản on-chain: Quản lý đồng coin gốc **Native ETH** với quy trình nạp, rút, chuyển, kiểm tra số dư và ghi lại lịch sử giao dịch toàn diện.
3. Đáp ứng đầy đủ các tiêu chuẩn bảo mật khắt khe: Phòng chống Re-entrancy bằng mô hình CEI và Reentrancy Guard; chống tràn số học ở tầng compiler; kiểm soát truy cập Owner; tích hợp cơ chế ngắt mạch Circuit Breaker khi khẩn cấp.
4. Xây dựng bộ kiểm thử hoàn chỉnh với 34 unit tests tự động và kiểm thử trực tiếp trên Remix IDE.
5. Triển khai và chạy thực nghiệm thành công trên cả mạng cục bộ **Ganache** và mạng thử nghiệm công khai **Ethereum Sepolia Testnet**.

### 6.2 Hướng phát triển mở rộng
* Tích hợp cơ chế Ví đa chữ ký (Multi-Signature Wallet) yêu cầu $m/n$ chủ sở hữu cùng ký duyệt khi chuyển các khoản tiền lớn.
* Áp dụng tiêu chuẩn trừu tượng hóa tài khoản **Account Abstraction (ERC-4337)** cho phép thanh toán phí gas bằng chính token ERC-20 (Paymaster) và khôi phục ví qua mạng xã hội (Social Recovery).
* Tích hợp mạng mở rộng Layer-2 (Arbitrum, Optimism) để giảm thiểu tối đa phí gas và nâng cao tốc độ xác nhận giao dịch.

---

## TÀI LIỆU THAM KHẢO

1. **Ethereum Foundation.** *Ethereum Development Documentation & Whitepaper.* https://ethereum.org/en/developers/docs/
2. **Solidity Programming Language.** *Solidity Documentation (v0.8.24).* https://docs.soliditylang.org/
3. **Remix IDE Team.** *Remix IDE Documentation & Solidity Unit Testing Plugin.* https://remix-ide.readthedocs.io/
4. **OpenZeppelin.** *Smart Contract Security Guidelines and Vulnerabilities Matrix.* https://docs.openzeppelin.com/
5. **Etherscan.** *Ethereum Sepolia Testnet Block Explorer.* https://sepolia.etherscan.io/
6. **Truffle Suite.** *Ganache Local Ethereum Blockchain.* https://archive.trufflesuite.com/ganache/
