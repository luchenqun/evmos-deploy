import { ethers, parseEther } from "ethers";

const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const main = async () => {
  try {
    const ADDRESS = "0x546bc6E008689577C69C42b9C1f6b4C923f59B5d";
    const PROVIDER = "http://ethos-eth-rpc.mybc.fun/";
    const provider = new ethers.JsonRpcProvider(PROVIDER);
    const ABI = [
      {
        inputs: [
          {
            internalType: "address",
            name: "to",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "amount",
            type: "uint256",
          },
        ],
        name: "transfer",
        outputs: [
          {
            internalType: "bool",
            name: "",
            type: "bool",
          },
        ],
        stateMutability: "nonpayable",
        type: "function",
      },
    ];
    const wallet = new ethers.Wallet("f78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769", provider);

    const contract = new ethers.Contract(ADDRESS, ABI, wallet);
    const listAddress = ["0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96", "0x2222207B1f7b8d37566D9A2778732451dbfbC5d0", "0x33333BFfC67Dd05A5644b02897AC245BAEd69040", "0x4444434e38E74c3e692704e4Ba275DAe810B6392", "0x55555d6c72886E5500a9410Ca15D08A16011ed95"];

    while (true) {
      const to = listAddress[Math.floor(Math.random() * listAddress.length)];
      const value = parseEther(String(Math.random())).toString();

      let tx;
      if (Math.random() >= 0.5) {
        tx = await wallet.sendTransaction({ to, value });
      } else {
        tx = await contract.transfer(to, value);
      }
      await tx.wait();

      await sleep(getRandomInt(1000, 6000));
    }
  } catch (error) {
    console.log("error: ", error);
  }
};

main();
