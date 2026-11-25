const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function deploy(name, ...args) {
  const Factory = await hre.ethers.getContractFactory(name);
  const c = await Factory.deploy(...args);
  await c.waitForDeployment();
  const address = await c.getAddress();
  const artifact = await hre.artifacts.readArtifact(name);
  console.log(`✔ ${name} -> ${address}`);
  return { address, abi: artifact.abi };
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const net = await hre.ethers.provider.getNetwork();
  console.log(`Deploy bằng tài khoản ${deployer.address} (chainId ${net.chainId})`);

  const smartWallet = await deploy("SmartWallet");

  const cfg = {
    chainId: Number(net.chainId),
    rpcUrl: hre.network.config.url || "http://127.0.0.1:7545",
    smartWallet,
  };
  const out = path.join(__dirname, "..", "web", "config.js");
  fs.writeFileSync(out, `// Tự động sinh bởi scripts/deploy.js\nwindow.WALLET_CONFIG = ${JSON.stringify(cfg, null, 2)};\n`);
  console.log("Đã ghi", out);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
