import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "viem";

describe("DailyFlowCapsule", function () {
  it("Should seal and reveal a capsule", async function () {
    const [owner] = await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();

    const contract = await hre.viem.deployContract("DailyFlowCapsule");

    const contentHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const unlockAt = BigInt(Math.floor(Date.now() / 1000) + 86400);

    const tx = await contract.write.seal([contentHash, unlockAt, 0, false]);
    await publicClient.waitForTransactionReceipt({ hash: tx });

    const count = await contract.read.capsuleCount();
    expect(count).to.equal(1n);

    const capsule = await contract.read.getCapsule([1n]);
    expect(capsule.creator.toLowerCase()).to.equal(owner.account.address.toLowerCase());
    expect(capsule.contentHash).to.equal(contentHash);

    const revealTx = await contract.write.reveal([1n, 1]);
    await publicClient.waitForTransactionReceipt({ hash: revealTx });

    const updated = await contract.read.getCapsule([1n]);
    expect(updated.status).to.equal(1);
  });
});
