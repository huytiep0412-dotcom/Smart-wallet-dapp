// Script thuc hien chu trinh test truc tiep tren Ganache cho SmartWallet
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const cfgText = fs.readFileSync(path.join(__dirname, "..", "web", "config.js"), "utf8");
  const cfg = JSON.parse(cfgText.slice(cfgText.indexOf("{"), cfgText.lastIndexOf("}") + 1));
  const [deployer, alice, bob] = await hre.ethers.getSigners();
  const e = hre.ethers.parseEther;

  const smartWalletAddress = cfg.smartWallet ? cfg.smartWallet.address : cfg.wallet.address;
  console.log("=== THUC HIEN KIEM THU TRUC TIEP TREN GANACHE ===");
  console.log("Dia chi SmartWallet:", smartWalletAddress);
  console.log("Tai khoan thuc hien (Account #0):", deployer.address);
  console.log("Tai khoan nguoi nhan (Bob):", bob.address);

  const smartWallet = await hre.ethers.getContractAt("SmartWallet", smartWalletAddress);

  // 1. So du truoc test
  const balBefore = await smartWallet.getBalance(deployer.address);
  console.log("\n[1] So du ban dau cua Account #0 trong hop dong:", hre.ethers.formatEther(balBefore), "ETH");

  // 2. Test 1: Nap 2.0 ETH
  console.log("\n[2] Dang nap 2.0 ETH vao SmartWallet...");
  const txDeposit = await smartWallet.connect(deployer).deposit({ value: e("2.0") });
  const rcDeposit = await txDeposit.wait();
  console.log("✔ Nap thanh cong! TxHash:", rcDeposit.hash, "| Block:", rcDeposit.blockNumber);
  const balAfterDeposit = await smartWallet.getBalance(deployer.address);
  console.log("   -> So du moi trong hop dong:", hre.ethers.formatEther(balAfterDeposit), "ETH");

  // 3. Test 2: Chuyen 0.5 ETH cho Bob kem ghi chu
  console.log("\n[3] Dang chuyen 0.5 ETH cho Bob voi ghi chu 'Chuyen tien test UI'...");
  const txTransfer = await smartWallet.connect(deployer).transferToken(bob.address, e("0.5"), "Chuyen tien test UI");
  const rcTransfer = await txTransfer.wait();
  console.log("✔ Chuyen tien thanh cong! TxHash:", rcTransfer.hash, "| Block:", rcTransfer.blockNumber);
  const balBob = await smartWallet.getBalance(bob.address);
  console.log("   -> So du cua Bob trong hop dong:", hre.ethers.formatEther(balBob), "ETH");

  // 4. Test 3: Rut 0.3 ETH ve vi ca nhan
  console.log("\n[4] Dang rut 0.3 ETH tu hop dong ve vi ca nhan...");
  const txWithdraw = await smartWallet.connect(deployer).withdraw(e("0.3"));
  const rcWithdraw = await txWithdraw.wait();
  console.log("✔ Rut tien thanh cong! TxHash:", rcWithdraw.hash, "| Block:", rcWithdraw.blockNumber);
  const balFinal = await smartWallet.getBalance(deployer.address);
  console.log("   -> So du cuoi cung cua Account #0:", hre.ethers.formatEther(balFinal), "ETH");

  // 5. Kiem tra toan bo lich su on-chain
  const allHistory = await smartWallet.getTransactionHistory();
  console.log("\n[5] Tong so giao dich on-chain tren so cai:", allHistory.length);
  console.log("--- 3 GIAO DICH MOI NHAT ---");
  const latest3 = allHistory.slice(-3);
  latest3.forEach((tx, idx) => {
    console.log(`GD #${allHistory.length - 2 + idx}: Loai=${tx.txType} | Tu=${tx.from.slice(0, 8)}... | Den=${tx.to.slice(0, 8)}... | So luong=${hre.ethers.formatEther(tx.amount)} ETH | Ghi chu="${tx.note}"`);
  });
  console.log("\n=== KIEM THU HOAN TAT 100% THANH CONG! ===");
}

main().catch((e) => {
  console.error("Loi:", e);
  process.exitCode = 1;
});
