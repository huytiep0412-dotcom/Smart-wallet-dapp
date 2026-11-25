// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @dev Interface ERC-20 toi gian de tuong tac voi cac token nhu PCToken
 */
interface IERC20Minimal {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// =========================================================================
// A. CAC HOP DONG TRUU TUONG CO SO (Ke thua - Inheritance)
// =========================================================================

/**
 * @dev Quan ly quyen so huu va kiem soat truy cap (Access Control)
 */
abstract contract Ownable {
    address public owner;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "SmartWallet: Caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "SmartWallet: New owner is the zero address");
        address old = owner;
        owner = _newOwner;
        emit OwnershipTransferred(old, _newOwner);
    }
}

/**
 * @dev Phong chong tan cong tai nhap (Re-entrancy Guard)
 */
abstract contract ReentrancyGuard {
    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;

    modifier nonReentrant() {
        require(_status != _ENTERED, "SmartWallet: ReentrancyGuard reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    constructor() {
        _status = _NOT_ENTERED;
    }
}

/**
 * @dev Co che ngat mach khan cap (Circuit Breaker) ke thua tu Ownable
 */
abstract contract Pausable is Ownable {
    bool public paused;
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    modifier whenNotPaused() {
        require(!paused, "SmartWallet: Contract is paused");
        _;
    }

    modifier whenPaused() {
        require(paused, "SmartWallet: Contract is not paused");
        _;
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner whenPaused {
        paused = false;
        emit Unpaused(msg.sender);
    }
}

// =========================================================================
// B. SMARTWALLET CHINH (Ke thua: Ownable, Pausable, ReentrancyGuard)
// =========================================================================

/**
 * @title  SmartWallet — Hop dong thong minh Quan ly Vi dien tu da tai san
 * @author Sinh vien thuc hien do an mon Lap trinh Blockchain
 * @notice De tai: Xay dung hop dong thong minh quan ly vi dien tu
 *         Mon hoc: Lap trinh Blockchain
 *
 * @dev    Thiet ke doc lap (zero external imports) — bien dich truc tiep tren Remix IDE,
 *         trien khai len Ganache va Sepolia Testnet.
 *
 *         Ke thua (Inheritance) tu:
 *           - Ownable: Phan quyen quan tri (Access Control voi modifier onlyOwner)
 *           - Pausable: Ngat mach khan cap (Circuit Breaker khi co su co)
 *           - ReentrancyGuard: Khoa chong tan cong tai nhap (nonReentrant)
 *
 *         Ho tro ca:
 *           - Native ETH (address(0))
 *           - Token ERC-20 (nhu PCToken)
 *
 *         Chuc nang chinh:
 *           1. Nap ETH / Token                   → deposit(), depositToken(token, amount)
 *           2. Rut ETH / Token ve vi ca nhan     → withdraw(amount), withdrawToken(token, amount)
 *           3. Chuyen so du noi bo               → transferToken(to, amount, note), transferERC20(...)
 *           4. Kiem tra so du                    → getBalance(user), balanceOf(token, user)
 *           5. Truy xuat lich su giao dich       → getTransactionHistory()
 *
 *         Ky thuat Solidity & Bao mat ap dung:
 *           • struct, mapping, modifier, event, Checks-Effects-Interactions (CEI)
 *           • Ke thua (Inheritance): Ownable, Pausable, ReentrancyGuard
 *           • Reentrancy Guard — modifier nonReentrant
 *           • Circuit Breaker — pause() / unpause() bao ve khan cap
 *           • Access Control — modifier onlyOwner cho ham quan tri
 *           • Overflow/Underflow — Solidity ^0.8.x tu bao ve
 */
contract SmartWallet is Ownable, Pausable, ReentrancyGuard {

    // =========================================================================
    // 1. KIEU DU LIEU & DINH NGHIA (struct)
    // =========================================================================

    /**
     * @dev Luu tru thong tin chi tiet cua moi giao dich on-chain.
     */
    struct Transaction {
        uint256 id;        // Ma dinh danh tang dan tu 1
        string  txType;    // "DEPOSIT" | "WITHDRAW" | "TRANSFER"
        address token;     // address(0) la ETH, hoac dia chi contract ERC-20 (PCT)
        address from;      // Nguoi khoi tao giao dich
        address to;        // Doi tac nhan (address(0) neu nap/rut)
        uint256 amount;    // So luong wei / token
        string  note;      // Ghi chu do nguoi dung nhap
        uint256 timestamp; // Unix timestamp khi block duoc dao
    }

    // =========================================================================
    // 2. BIEN TRANG THAI (State Variables)
    // =========================================================================

    /// @notice Han muc rut tien toi da trong 1 giao dich ETH (0 = khong gioi han)
    uint256 public maxWithdrawLimit;

    /// @notice Danh sach vi tin cay — duoc mien kiem tra han muc rut
    mapping(address => bool) public isWhitelisted;

    /// @dev So du ETH noi bo cua tung dia chi trong hop dong (don vi: wei)
    mapping(address => uint256) private balances;

    /// @dev So du Token ERC-20 noi bo: token => user => balance
    mapping(address => mapping(address => uint256)) private tokenBalances;

    /// @dev Toan bo lich su giao dich on-chain (append-only)
    Transaction[] private transactions;

    // =========================================================================
    // 3. SU KIEN (Events)
    // =========================================================================

    event Deposited(address indexed user, uint256 amount, uint256 timestamp);
    event Withdrawn(address indexed user, uint256 amount, uint256 timestamp);
    event Transferred(
        address indexed from,
        address indexed to,
        uint256 amount,
        string  note,
        uint256 timestamp
    );

    // Su kien danh rieng cho Token ERC-20
    event TokenDeposited(address indexed token, address indexed user, uint256 amount, uint256 timestamp);
    event TokenWithdrawn(address indexed token, address indexed user, uint256 amount, uint256 timestamp);

    // Su kien quan tri
    event MaxWithdrawLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event WhitelistUpdated(address indexed account, bool status);

    // =========================================================================
    // 4. HAM KHOI TAO (Constructor)
    // =========================================================================

    constructor() {
        maxWithdrawLimit          = 0;
        isWhitelisted[msg.sender] = true;

        emit WhitelistUpdated(msg.sender, true);
    }

    // =========================================================================
    // 5. HAM QUAN TRI & HAN MUC
    // =========================================================================

    function setMaxWithdrawLimit(uint256 _limit) external onlyOwner {
        uint256 old = maxWithdrawLimit;
        maxWithdrawLimit = _limit;
        emit MaxWithdrawLimitUpdated(old, _limit);
    }

    function setWhitelist(address _account, bool _enabled) external onlyOwner {
        require(_account != address(0), "SmartWallet: Invalid address");
        isWhitelisted[_account] = _enabled;
        emit WhitelistUpdated(_account, _enabled);
    }

    // =========================================================================
    // 6. CHUC NANG COT LOI: ETH (deposit, withdraw, transfer)
    // =========================================================================

    // --- 6.1 NAP ETH ---
    function deposit() public payable whenNotPaused {
        _depositWithNote("Nap ETH vao vi");
    }

    function depositWithNote(string memory _note) public payable whenNotPaused {
        _depositWithNote(_note);
    }

    function _depositWithNote(string memory _note) internal {
        require(msg.value > 0, "SmartWallet: Deposit amount must be greater than 0");
        balances[msg.sender] += msg.value;
        _recordTransaction("DEPOSIT", address(0), msg.sender, address(0), msg.value, _note);
        emit Deposited(msg.sender, msg.value, block.timestamp);
    }

    receive() external payable {
        deposit();
    }

    fallback() external payable {
        deposit();
    }

    // --- 6.2 RUT ETH ---
    function withdraw(uint256 _amount) external whenNotPaused nonReentrant {
        _withdrawWithNote(_amount, "Rut ETH ve vi ca nhan");
    }

    function withdrawWithNote(uint256 _amount, string memory _note) external whenNotPaused nonReentrant {
        _withdrawWithNote(_amount, _note);
    }

    function _withdrawWithNote(uint256 _amount, string memory _note) internal {
        require(_amount > 0,                     "SmartWallet: Withdraw amount must be greater than 0");
        require(balances[msg.sender] >= _amount, "SmartWallet: Insufficient balance");

        if (maxWithdrawLimit > 0 && !isWhitelisted[msg.sender]) {
            require(_amount <= maxWithdrawLimit, "SmartWallet: Amount exceeds max withdraw limit");
        }

        // CEI: Effects truoc
        balances[msg.sender] -= _amount;
        _recordTransaction("WITHDRAW", address(0), msg.sender, address(0), _amount, _note);

        // Interactions sau
        (bool success, ) = payable(msg.sender).call{value: _amount}("");
        require(success, "SmartWallet: ETH transfer failed");

        emit Withdrawn(msg.sender, _amount, block.timestamp);
    }

    // --- 6.3 CHUYEN ETH NOI BO ---
    function transferToken(
        address _to,
        uint256 _amount,
        string memory _note
    ) external whenNotPaused nonReentrant {
        require(_to != address(0),        "SmartWallet: Cannot transfer to the zero address");
        require(_to != msg.sender,        "SmartWallet: Cannot transfer to yourself");
        require(_amount > 0,              "SmartWallet: Transfer amount must be greater than 0");
        require(balances[msg.sender] >= _amount, "SmartWallet: Insufficient balance");

        balances[msg.sender] -= _amount;
        balances[_to]        += _amount;

        _recordTransaction("TRANSFER", address(0), msg.sender, _to, _amount, _note);
        emit Transferred(msg.sender, _to, _amount, _note, block.timestamp);
    }

    // =========================================================================
    // 7. CHUC NANG TOKEN ERC-20 (PCToken, v.v.)
    // =========================================================================

    /**
     * @notice Nap token ERC-20 (nhu PCT) vao vi thong minh.
     * @dev Yeu cau nguoi dung da goi token.approve(smartWallet, amount) truoc do.
     * @param _token Dia chi smart contract token ERC-20
     * @param _amount So luong token muon nap
     */
    function depositToken(address _token, uint256 _amount) external whenNotPaused nonReentrant {
        require(_token != address(0), "SmartWallet: Use deposit() for ETH");
        require(_amount > 0, "SmartWallet: Deposit amount must be greater than 0");

        uint256 beforeBal = IERC20Minimal(_token).balanceOf(address(this));
        require(
            IERC20Minimal(_token).transferFrom(msg.sender, address(this), _amount),
            "SmartWallet: Token transferFrom failed"
        );
        uint256 received = IERC20Minimal(_token).balanceOf(address(this)) - beforeBal;

        tokenBalances[_token][msg.sender] += received;
        _recordTransaction("DEPOSIT", _token, msg.sender, address(0), received, "Nap token vao vi");
        emit TokenDeposited(_token, msg.sender, received, block.timestamp);
    }

    /**
     * @notice Rut token ERC-20 tu vi thong minh ve lai vi ca nhan (EOA).
     * @param _token Dia chi contract token can rut
     * @param _amount So luong token muon rut
     */
    function withdrawToken(address _token, uint256 _amount) external whenNotPaused nonReentrant {
        require(_token != address(0), "SmartWallet: Use withdraw() for ETH");
        require(_amount > 0, "SmartWallet: Withdraw amount must be greater than 0");
        require(tokenBalances[_token][msg.sender] >= _amount, "SmartWallet: Insufficient token balance");

        // CEI: Tru so du noi bo truoc
        tokenBalances[_token][msg.sender] -= _amount;
        _recordTransaction("WITHDRAW", _token, msg.sender, address(0), _amount, "Rut token ve vi ca nhan");

        // Chuyen token tra ve cho nguoi dung
        require(IERC20Minimal(_token).transfer(msg.sender, _amount), "SmartWallet: Token transfer failed");
        emit TokenWithdrawn(_token, msg.sender, _amount, block.timestamp);
    }

    /**
     * @notice Chuyen token ERC-20 noi bo giua 2 nguoi dung trong vi thong minh.
     * @param _token Dia chi contract token
     * @param _to Dia chi vi nguoi nhan
     * @param _amount So luong token muon chuyen
     * @param _note Ghi chu giao dich
     */
    function transferERC20(
        address _token,
        address _to,
        uint256 _amount,
        string memory _note
    ) external whenNotPaused nonReentrant {
        require(_token != address(0), "SmartWallet: Use transferToken for ETH");
        require(_to != address(0), "SmartWallet: Cannot transfer to the zero address");
        require(_to != msg.sender, "SmartWallet: Cannot transfer to yourself");
        require(_amount > 0, "SmartWallet: Transfer amount must be greater than 0");
        require(tokenBalances[_token][msg.sender] >= _amount, "SmartWallet: Insufficient token balance");

        tokenBalances[_token][msg.sender] -= _amount;
        tokenBalances[_token][_to]        += _amount;

        _recordTransaction("TRANSFER", _token, msg.sender, _to, _amount, _note);
        emit Transferred(msg.sender, _to, _amount, _note, block.timestamp);
    }

    // =========================================================================
    // 8. HAM TRA CUU & DOC DU LIEU (View / Getters)
    // =========================================================================

    /**
     * @notice Tra cuu so du ETH hien tai cua nguoi dung trong vi
     */
    function getBalance(address _user) external view returns (uint256) {
        return balances[_user];
    }

    /**
     * @notice Tra cuu so du da tai san: token=address(0) la ETH, khac la ERC-20
     */
    function balanceOf(address _token, address _user) external view returns (uint256) {
        if (_token == address(0)) {
            return balances[_user];
        }
        return tokenBalances[_token][_user];
    }

    /**
     * @notice Tra cuu so du token ERC-20 cu the
     */
    function getTokenBalance(address _token, address _user) external view returns (uint256) {
        return tokenBalances[_token][_user];
    }

    /**
     * @notice Lay toan bo danh sach lich su giao dich
     */
    function getTransactionHistory() external view returns (Transaction[] memory) {
        return transactions;
    }

    /**
     * @notice Lay tong so luong giao dich
     */
    function getTransactionCount() external view returns (uint256) {
        return transactions.length;
    }

    /**
     * @notice Loc giao dich theo dia chi nguoi dung
     */
    function getUserTransactions(address _user) external view returns (Transaction[] memory) {
        uint256 total = transactions.length;
        uint256 count = 0;

        for (uint256 i = 0; i < total; i++) {
            if (transactions[i].from == _user || transactions[i].to == _user) {
                count++;
            }
        }

        Transaction[] memory userTxs = new Transaction[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < total; i++) {
            if (transactions[i].from == _user || transactions[i].to == _user) {
                userTxs[idx++] = transactions[i];
            }
        }
        return userTxs;
    }

    /**
     * @notice Tra cuu tong so ETH thuc te trong hop dong
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // =========================================================================
    // 9. HAM NOI BO (Internal Helpers)
    // =========================================================================

    function _recordTransaction(
        string memory _txType,
        address _token,
        address _from,
        address _to,
        uint256 _amount,
        string memory _note
    ) internal {
        transactions.push(Transaction({
            id:        transactions.length + 1,
            txType:    _txType,
            token:     _token,
            from:      _from,
            to:        _to,
            amount:    _amount,
            note:      _note,
            timestamp: block.timestamp
        }));
    }
}
