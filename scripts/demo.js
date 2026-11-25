// Tạo giao dịch mẫu on-chain trên SmartWallet để lịch sử có sẵn dữ liệu khi demo
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const cfgText = fs.readFileSync(path.join(__dirname, "..", "web", "config.js"), "utf8");
  const cfg = JSON.parse(cfgText.slice(cfgText.indexOf("{"), cfgText.lastIndexOf("}") + 1));
  const [deployer, alice, bob] = await hre.ethers.getSigners();
  const e = hre.ethers.parseEther;

  // Đảm bảo Alice có đủ ETH để thực hiện deposit
  const aliceBal = await hre.ethers.provider.getBalance(alice.address);
  if (aliceBal < e("10.0")) {
    console.log("Funding Alice with 50 ETH from Deployer...");
    await (await deployer.sendTransaction({ to: alice.address, value: e("50.0") })).wait();
  }

  const smartWallet = await hre.ethers.getContractAt("SmartWallet", cfg.smartWallet ? cfg.smartWallet.address : cfg.wallet.address);
  console.log("Seeding on SmartWallet:", await smartWallet.getAddress());

  await (await smartWallet.connect(alice).deposit({ value: e("8.42") })).wait();
  await (await smartWallet.connect(alice).transferToken(bob.address, e("1.5"), "Thanh toán đồ án")).wait();
  await (await smartWallet.connect(alice).transferToken(deployer.address, e("0.85"), "Thanh toán thiết kế")).wait();
  await (await smartWallet.connect(bob).withdraw(e("0.5"))).wait();

  console.log("✔ Demo data seeded successfully!");
  console.log("Alice:", alice.address, "Balance:", hre.ethers.formatEther(await smartWallet.getBalance(alice.address)), "ETH");
  console.log("Bob:  ", bob.address, "Balance:", hre.ethers.formatEther(await smartWallet.getBalance(bob.address)), "ETH");
  console.log("Total on-chain transactions:", (await smartWallet.getTransactionHistory()).length);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
