const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SmartWallet", function () {
  let smartWallet, owner, alice, bob;
  const parseEth = ethers.parseEther;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SmartWallet");
    smartWallet = await Factory.deploy();
    await smartWallet.waitForDeployment();
  });

  describe("Khoi tao & Phan quyen", function () {
    it("owner la nguoi deploy hop dong", async function () {
      expect(await smartWallet.owner()).to.equal(owner.address);
      expect(await smartWallet.paused()).to.equal(false);
      expect(await smartWallet.isWhitelisted(owner.address)).to.equal(true);
    });

    it("chi owner moi co the pause va unpause", async function () {
      await expect(smartWallet.connect(alice).pause()).to.be.revertedWith("SmartWallet: Caller is not the owner");
      await smartWallet.connect(owner).pause();
      expect(await smartWallet.paused()).to.equal(true);

      await smartWallet.connect(owner).unpause();
      expect(await smartWallet.paused()).to.equal(false);
    });

    it("quan ly whitelist va han muc rut tien", async function () {
      await smartWallet.connect(owner).setMaxWithdrawLimit(parseEth("2.0"));
      expect(await smartWallet.maxWithdrawLimit()).to.equal(parseEth("2.0"));

      await smartWallet.connect(owner).setWhitelist(alice.address, true);
      expect(await smartWallet.isWhitelisted(alice.address)).to.equal(true);
    });
  });

  describe("Nap tien (deposit & receive)", function () {
    it("nap ETH bang deposit()", async function () {
      await expect(smartWallet.connect(alice).deposit({ value: parseEth("3.0") }))
        .to.emit(smartWallet, "Deposited");

      expect(await smartWallet.getBalance(alice.address)).to.equal(parseEth("3.0"));
      expect(await smartWallet.getContractBalance()).to.equal(parseEth("3.0"));

      const history = await smartWallet.getTransactionHistory();
      expect(history.length).to.equal(1);
      expect(history[0].txType).to.equal("DEPOSIT");
      expect(history[0].from).to.equal(alice.address);
      expect(history[0].amount).to.equal(parseEth("3.0"));
    });

    it("nap ETH bang depositWithNote() kem ghi chu", async function () {
      await smartWallet.connect(alice).depositWithNote("Nap tien tiet kiem", { value: parseEth("2.5") });
      expect(await smartWallet.getBalance(alice.address)).to.equal(parseEth("2.5"));
      const history = await smartWallet.getTransactionHistory();
      expect(history[0].note).to.equal("Nap tien tiet kiem");
    });

    it("nap ETH truc tiep qua receive()", async function () {
      await alice.sendTransaction({
        to: await smartWallet.getAddress(),
        value: parseEth("1.5"),
      });
      expect(await smartWallet.getBalance(alice.address)).to.equal(parseEth("1.5"));
    });

    it("nap ETH qua fallback() khi co calldata", async function () {
      await alice.sendTransaction({
        to: await smartWallet.getAddress(),
        value: parseEth("1.0"),
        data: "0x1234",
      });
      expect(await smartWallet.getBalance(alice.address)).to.equal(parseEth("1.0"));
    });

    it("tu choi nap 0 ETH", async function () {
      await expect(smartWallet.connect(alice).deposit({ value: 0 })).to.be.revertedWith(
        "SmartWallet: Deposit amount must be greater than 0"
      );
    });

    it("khong the nap khi hop dong bi paused", async function () {
      await smartWallet.connect(owner).pause();
      await expect(
        smartWallet.connect(alice).deposit({ value: parseEth("1.0") })
      ).to.be.revertedWith("SmartWallet: Contract is paused");
    });
  });

  describe("Rut tien (withdraw)", function () {
    beforeEach(async function () {
      await smartWallet.connect(alice).deposit({ value: parseEth("5.0") });
    });

    it("rut tien thanh cong, cap nhat so du va ghi lich su", async function () {
      const balBefore = await ethers.provider.getBalance(alice.address);
      const tx = await smartWallet.connect(alice).withdraw(parseEth("2.0"));
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      expect(await smartWallet.getBalance(alice.address)).to.equal(parseEth("3.0"));
      const balAfter = await ethers.provider.getBalance(alice.address);
      expect(balAfter).to.equal(balBefore + parseEth("2.0") - gasCost);

      const history = await smartWallet.getTransactionHistory();
      expect(history.length).to.equal(2);
      expect(history[1].txType).to.equal("WITHDRAW");
      expect(history[1].from).to.equal(alice.address);
      expect(history[1].amount).to.equal(parseEth("2.0"));
    });

    it("rut tien bang withdrawWithNote() kem ghi chu", async function () {
      await smartWallet.connect(alice).withdrawWithNote(parseEth("1.0"), "Rut tien tieu dung");
      expect(await smartWallet.getBalance(alice.address)).to.equal(parseEth("4.0"));
      const history = await smartWallet.getTransactionHistory();
      expect(history[1].note).to.equal("Rut tien tieu dung");
    });

    it("tu choi khi rut vuot qua so du", async function () {
      await expect(smartWallet.connect(alice).withdraw(parseEth("6.0"))).to.be.revertedWith(
        "SmartWallet: Insufficient balance"
      );
    });

    it("chan rut vuot han muc maxWithdrawLimit neu khong trong whitelist", async function () {
      await smartWallet.connect(owner).setMaxWithdrawLimit(parseEth("1.0"));

      // Alice chua vao whitelist -> bi chan
      await expect(smartWallet.connect(alice).withdraw(parseEth("2.0"))).to.be.revertedWith(
        "SmartWallet: Amount exceeds max withdraw limit"
      );

      // Cho Alice vao whitelist -> rut duoc binh thuong
      await smartWallet.connect(owner).setWhitelist(alice.address, true);
      await expect(smartWallet.connect(alice).withdraw(parseEth("2.0"))).to.not.be.reverted;
    });
  });

  describe("Chuyen tien noi bo (transferToken)", function () {
    beforeEach(async function () {
      await smartWallet.connect(alice).deposit({ value: parseEth("4.0") });
    });

    it("chuyen tien thanh cong kem ghi chu", async function () {
      await expect(
        smartWallet.connect(alice).transferToken(bob.address, parseEth("1.5"), "Thanh toan do an")
      )
        .to.emit(smartWallet, "Transferred")
        .withArgs(alice.address, bob.address, parseEth("1.5"), "Thanh toan do an", (val) => val > 0);

      expect(await smartWallet.getBalance(alice.address)).to.equal(parseEth("2.5"));
      expect(await smartWallet.getBalance(bob.address)).to.equal(parseEth("1.5"));

      const history = await smartWallet.getTransactionHistory();
      expect(history.length).to.equal(2);
      expect(history[1].txType).to.equal("TRANSFER");
      expect(history[1].from).to.equal(alice.address);
      expect(history[1].to).to.equal(bob.address);
      expect(history[1].note).to.equal("Thanh toan do an");
    });

    it("tu choi khi tu chuyen cho chinh minh hoac dia chi 0", async function () {
      await expect(
        smartWallet.connect(alice).transferToken(alice.address, parseEth("1.0"), "Tu chuyen")
      ).to.be.revertedWith("SmartWallet: Cannot transfer to yourself");

      await expect(
        smartWallet.connect(alice).transferToken(ethers.ZeroAddress, parseEth("1.0"), "Dia chi 0")
      ).to.be.revertedWith("SmartWallet: Cannot transfer to the zero address");
    });
  });

  describe("Tra cuu lich su theo nguoi dung", function () {
    it("getUserTransactions tra ve dung giao dich cua user", async function () {
      await smartWallet.connect(alice).deposit({ value: parseEth("2.0") });
      await smartWallet.connect(bob).deposit({ value: parseEth("3.0") });
      await smartWallet.connect(alice).transferToken(bob.address, parseEth("0.5"), "Tra no");

      const aliceTxs = await smartWallet.getUserTransactions(alice.address);
      const bobTxs = await smartWallet.getUserTransactions(bob.address);

      expect(aliceTxs.length).to.equal(2); // 1 deposit + 1 transfer out
      expect(bobTxs.length).to.equal(2);   // 1 deposit + 1 transfer in
    });
  });
});
