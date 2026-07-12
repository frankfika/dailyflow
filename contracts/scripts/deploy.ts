import hre from "hardhat";
import { writeFileSync } from "fs";
import { resolve } from "path";

async function main() {
  const network = hre.network.name;
  console.log(`Deploying DailyFlowCapsule to ${network}...`);

  const DailyFlowCapsule = await hre.viem.deployContract("DailyFlowCapsule");
  const address = DailyFlowCapsule.address;

  console.log(`DailyFlowCapsule deployed to: ${address}`);
  console.log(`Network: ${network}`);

  const deploymentsPath = resolve(__dirname, "../deployments.json");
  let deployments: Record<string, string> = {};
  try {
    deployments = JSON.parse(readFileSync(deploymentsPath, "utf-8")) as Record<string, string>;
  } catch {}
  deployments[network] = address;
  writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log(`Saved deployment to ${deploymentsPath}`);
}

function readFileSync(path: string, encoding: BufferEncoding): string {
  const fs = require("fs");
  return fs.readFileSync(path, encoding);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
