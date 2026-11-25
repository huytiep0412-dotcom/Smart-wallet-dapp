// Script chuyển quyền Quản trị (Owner) của SmartWallet cho khách hàng / đối tác
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const newOwner = process.env.NEW_OWNER || process.argv[2];

  if (!newOwner || !hre.ethers.isAddress(newOwner)) {
    console.error("Vui lòng cung cấp địa chỉ Owner mới hợp lệ!");
    console.log("Cách dùng: npx hardhat run scripts/transfer-owner.js --network ganache <NEW_OWNER_ADDRESS>");
    console.log("Hoặc: NEW_OWNER=0x... npx hardhat run scripts/transfer-owner.js --network sepolia");
    process.exit(1);
  }

  const cfgText = fs.readFileSync(path.join(__dirname, "..", "web", "config.js"), "utf8");
  const cfg = JSON.parse(cfgText.slice(cfgText.indexOf("{"), cfgText.lastIndexOf("}") + 1));
  const contractAddress = cfg.smartWallet ? cfg.smartWallet.address : cfg.wallet.address;

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Đang thực hiện chuyển quyền Owner bằng tài khoản: ${deployer.address}`);
  console.log(`Địa chỉ hợp đồng SmartWallet: ${contractAddress}`);
  console.log(`Chuyển quyền Owner sang: ${newOwner}`);

  const smartWallet = await hre.ethers.getContractAt("SmartWallet", contractAddress);
  const currentOwner = await smartWallet.owner();
  console.log(`Owner hiện tại: ${currentOwner}`);

  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error("LỖI: Tài khoản hiện tại không phải là Owner của hợp đồng!");
    process.exit(1);
  }

  const tx = await smartWallet.transferOwnership(newOwner);
  console.log("Giao dịch đang được xác nhận... Tx:", tx.hash);
  await tx.wait();

  const updatedOwner = await smartWallet.owner();
  console.log("✔ Bàn giao quyền Quản trị (Owner) thành công!");
  console.log(`Owner mới hiện tại của SmartWallet: ${updatedOwner}`);
}

main().catch((e) => {
  console.error("Lỗi:", e);
  process.exitCode = 1;
});
