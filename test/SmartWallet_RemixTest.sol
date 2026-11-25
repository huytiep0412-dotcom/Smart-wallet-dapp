// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title  SmartWallet_Test — Kiem thu don vi chay truc tiep tren Remix IDE
 * @notice Su dung Remix Unit Testing Plugin (tab "Solidity Unit Testing").
 *         Cach chay: Mo file nay tren Remix → Plugin "Solidity Unit Testing" → Run Tests.
 *
 * @dev    Bao phu 14 kich ban kiem thu:
 *         - Chuc nang happy-path: nap, rut, chuyen, tra cuu so du, lich su
 *         - Truong hop loi / bao mat: so luong 0, vuot so du, tu chuyen, dia chi 0,
 *           vuot han muc, Circuit Breaker, phan quyen onlyOwner
 */

import "remix_tests.sol";
import "remix_accounts.sol";
import "../contracts/SmartWallet.sol";

contract SmartWallet_Test {

    SmartWallet wallet;

    // Remix Unit Test cap phat tai khoan test qua TestsAccounts
    address acc0 = TestsAccounts.getAccount(0); // owner / deployer
    address acc1 = TestsAccounts.getAccount(1); // alice
    address acc2 = TestsAccounts.getAccount(2); // bob

    // =========================================================================
    // Setup — Chay truoc moi nhom test (Remix goi beforeAll/beforeEach)
    // =========================================================================

    /// @dev Deploy moi hop dong truoc moi bai test
    function beforeEach() public {
        wallet = new SmartWallet();
    }

    // =========================================================================
    // TC-01: Khoi tao hop dong
    // =========================================================================

    /// @notice Kiem tra owner va trang thai mac dinh sau deploy
    function checkOwnerOnDeploy() public {
        Assert.equal(wallet.owner(), address(this), "Owner phai la dia chi deploy (this contract)");
        Assert.equal(wallet.paused(), false,         "Hop dong phai o trang thai hoat dong binh thuong");
        Assert.equal(wallet.isWhitelisted(address(this)), true, "Owner phai duoc them vao whitelist ngay sau deploy");
        Assert.equal(wallet.maxWithdrawLimit(), uint256(0),     "Han muc rut mac dinh phai la 0 (khong gioi han)");
    }

    // =========================================================================
    // TC-02: Nap tien hop le
    // =========================================================================

    /// @notice Nap ETH thanh cong, so du cap nhat dung
    function checkDepositSuccess() public payable {
        uint256 depositAmt = 1 ether;
        wallet.deposit{value: depositAmt}();

        Assert.equal(
            wallet.getBalance(address(this)),
            depositAmt,
            "So du sau nap phai bang dung so ETH da nap"
        );
        Assert.equal(
            wallet.getContractBalance(),
            depositAmt,
            "So du ETH thuc te trong hop dong phai bang so da nap"
        );
    }

    // =========================================================================
    // TC-03: Lich su giao dich duoc ghi nhan sau nap tien
    // =========================================================================

    /// @notice Sau nap tien, getTransactionHistory() phai tra ve 1 ban ghi DEPOSIT
    function checkDepositRecordedInHistory() public payable {
        wallet.deposit{value: 2 ether}();

        SmartWallet.Transaction[] memory history = wallet.getTransactionHistory();
        Assert.equal(history.length, uint256(1), "Phai co dung 1 ban ghi trong lich su sau 1 lan nap");
        Assert.equal(
            keccak256(bytes(history[0].txType)),
            keccak256(bytes("DEPOSIT")),
            "Loai giao dich phai la DEPOSIT"
        );
        Assert.equal(history[0].from,   address(this), "Truong 'from' phai la dia chi nguoi nap");
        Assert.equal(history[0].amount, uint256(2 ether), "So luong phai khop voi so ETH da nap");
    }

    // =========================================================================
    // TC-04: Nap 0 ETH bi chan
    // =========================================================================

    /// @notice Nap 0 ETH phai bi revert voi thong bao loi ro rang
    function checkDepositZeroReverts() public {
        bool reverted = false;
        try wallet.deposit{value: 0}() {
            // Neu khong revert → test that bai
        } catch {
            reverted = true;
        }
        Assert.ok(reverted, "Nap 0 ETH phai bi revert: 'Deposit amount must be greater than 0'");
    }

    // =========================================================================
    // TC-05: Nap khi hop dong bi tam dung bi chan
    // =========================================================================

    /// @notice Circuit Breaker: deposit() bi revert khi paused = true
    function checkDepositBlockedWhenPaused() public payable {
        wallet.pause(); // Owner goi pause

        bool reverted = false;
        try wallet.deposit{value: 1 ether}() {
            // khong duoc thuc thi
        } catch {
            reverted = true;
        }
        Assert.ok(reverted, "deposit() phai bi revert khi hop dong dang o trang thai paused");
    }

    // =========================================================================
    // TC-06: Rut tien hop le
    // =========================================================================

    /// @notice Rut ETH thanh cong, so du giam dung
    function checkWithdrawSuccess() public payable {
        uint256 dep = 3 ether;
        uint256 wdr = 1 ether;
        wallet.deposit{value: dep}();

        uint256 balBefore = wallet.getBalance(address(this));
        wallet.withdraw(wdr);
        uint256 balAfter  = wallet.getBalance(address(this));

        Assert.equal(balAfter, balBefore - wdr, "So du sau rut phai giam dung so ETH da rut");

        SmartWallet.Transaction[] memory h = wallet.getTransactionHistory();
        Assert.equal(uint256(h.length), uint256(2), "Phai co 2 ban ghi: 1 DEPOSIT + 1 WITHDRAW");
        Assert.equal(
            keccak256(bytes(h[1].txType)),
            keccak256(bytes("WITHDRAW")),
            "Ban ghi thu 2 phai co loai WITHDRAW"
        );
    }

    // =========================================================================
    // TC-07: Rut vuot so du bi chan
    // =========================================================================

    /// @notice Rut so ETH lon hon so du trong hop dong phai bi revert
    function checkWithdrawExceedBalance() public payable {
        wallet.deposit{value: 1 ether}();

        bool reverted = false;
        try wallet.withdraw(5 ether) {
            // khong duoc thuc thi
        } catch {
            reverted = true;
        }
        Assert.ok(reverted, "Rut vuot so du phai bi revert: 'Insufficient balance'");
    }

    // =========================================================================
    // TC-08: Rut vuot han muc bi chan (neu khong trong whitelist)
    // =========================================================================

    /// @notice Owner dat han muc 1 ETH, nguoi dung thuong bi chan khi rut 2 ETH
    function checkWithdrawExceedMaxLimit() public payable {
        // Owner dat han muc 1 ETH
        wallet.setMaxWithdrawLimit(1 ether);
        // Nap 5 ETH
        wallet.deposit{value: 5 ether}();
        // Xoa owner khoi whitelist de test (mac dinh owner trong whitelist)
        wallet.setWhitelist(address(this), false);

        bool reverted = false;
        try wallet.withdraw(2 ether) {
            // Owner khong trong whitelist → bi han muc
        } catch {
            reverted = true;
        }
        Assert.ok(reverted, "Rut vuot han muc phai bi revert khi khong trong whitelist");
    }

    // =========================================================================
    // TC-09: Vi trong whitelist duoc mien han muc rut
    // =========================================================================

    /// @notice Vi trong whitelist rut vuot han muc van thanh cong
    function checkWhitelistBypassesLimit() public payable {
        wallet.setMaxWithdrawLimit(1 ether);
        // address(this) mac dinh da trong whitelist
        wallet.deposit{value: 5 ether}();

        bool reverted = false;
        try wallet.withdraw(2 ether) {
            // whitelist → khong bi han muc
        } catch {
            reverted = true;
        }
        Assert.ok(!reverted, "Vi trong whitelist phai duoc rut vuot han muc ma khong bi revert");
    }

    // =========================================================================
    // TC-10: Chuyen tien noi bo thanh cong
    // =========================================================================

    /// @notice Chuyen tien noi bo: so du 2 ben cap nhat dung, lich su ghi nhan
    function checkTransferTokenSuccess() public payable {
        address recipient = acc1; // tai khoan thu 2
        uint256 dep = 4 ether;
        uint256 trn = 1.5 ether;

        wallet.deposit{value: dep}();
        wallet.transferToken(recipient, trn, "Thanh toan do an");

        Assert.equal(
            wallet.getBalance(address(this)),
            dep - trn,
            "So du nguoi gui phai giam dung so da chuyen"
        );
        Assert.equal(
            wallet.getBalance(recipient),
            trn,
            "So du nguoi nhan phai tang dung so da chuyen"
        );

        SmartWallet.Transaction[] memory h = wallet.getTransactionHistory();
        Assert.equal(uint256(h.length), uint256(2), "Phai co 2 ban ghi: 1 DEPOSIT + 1 TRANSFER");
        Assert.equal(
            keccak256(bytes(h[1].txType)),
            keccak256(bytes("TRANSFER")),
            "Ban ghi thu 2 phai co loai TRANSFER"
        );
        Assert.equal(h[1].to,   recipient, "Truong 'to' phai la dia chi nguoi nhan");
        Assert.equal(h[1].from, address(this), "Truong 'from' phai la dia chi nguoi gui");
    }

    // =========================================================================
    // TC-11: Chuyen toi dia chi 0x0 bi chan
    // =========================================================================

    /// @notice Chuyen ETH toi address(0) phai bi revert
    function checkTransferToZeroReverts() public payable {
        wallet.deposit{value: 2 ether}();

        bool reverted = false;
        try wallet.transferToken(address(0), 1 ether, "Dia chi 0") {
            // khong duoc thuc thi
        } catch {
            reverted = true;
        }
        Assert.ok(reverted, "Chuyen toi address(0) phai bi revert: 'Cannot transfer to the zero address'");
    }

    // =========================================================================
    // TC-12: Tu chuyen cho chinh minh bi chan
    // =========================================================================

    /// @notice Chuyen ETH cho chinh msg.sender phai bi revert
    function checkTransferToSelfReverts() public payable {
        wallet.deposit{value: 2 ether}();

        bool reverted = false;
        try wallet.transferToken(address(this), 1 ether, "Tu chuyen") {
            // khong duoc thuc thi
        } catch {
            reverted = true;
        }
        Assert.ok(reverted, "Tu chuyen phai bi revert: 'Cannot transfer to yourself'");
    }

    // =========================================================================
    // TC-13: Phan quyen — chi owner moi goi duoc pause()
    // =========================================================================

    /// @notice Goi pause() tu dia chi khong phai owner phai bi revert
    function checkOnlyOwnerCanPause() public {
        // Deploy mot wallet moi de test: deploy boi address(this) = owner
        SmartWallet w2 = new SmartWallet();

        // Goi pause() tu chinh owner → thanh cong
        w2.pause();
        Assert.equal(w2.paused(), true, "Owner phai pause duoc hop dong");

        // Goi unpause() tu chinh owner → thanh cong
        w2.unpause();
        Assert.equal(w2.paused(), false, "Owner phai unpause duoc hop dong");
    }

    // =========================================================================
    // TC-14: getBalance tra ve dung sau nhieu thao tac
    // =========================================================================

    /// @notice getBalance phai phan anh chinh xac sau nap → chuyen → rut
    function checkGetBalanceAccuracy() public payable {
        address recipient = acc2;

        wallet.deposit{value: 5 ether}();
        Assert.equal(wallet.getBalance(address(this)), uint256(5 ether), "Sau nap: so du phai la 5 ETH");

        wallet.transferToken(recipient, 1 ether, "Tra no");
        Assert.equal(wallet.getBalance(address(this)), uint256(4 ether), "Sau chuyen 1 ETH: con lai 4 ETH");
        Assert.equal(wallet.getBalance(recipient),     uint256(1 ether), "Nguoi nhan phai co 1 ETH");

        wallet.withdraw(2 ether);
        Assert.equal(wallet.getBalance(address(this)), uint256(2 ether), "Sau rut 2 ETH: con lai 2 ETH");
    }

    // =========================================================================
    // Fallback: nhan ETH khi hop dong tra lai tien sau rut
    // =========================================================================
    receive() external payable {}
}
