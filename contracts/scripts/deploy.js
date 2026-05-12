const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying from:", deployer.address);

  const RitualTimeCapsule = await hre.ethers.getContractFactory("RitualTimeCapsule");
  const capsule = await RitualTimeCapsule.deploy();

  await capsule.waitForDeployment();

  console.log("✅ RitualTimeCapsule deployed to:", await capsule.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
