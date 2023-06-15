import path from "path";
import web3 from "web3";
import { decodeReply, execPromis, sleep } from "../utils.js";

let run = async function () {
  try {
    // you should use cmd `node init.js --v=1 --s=true` to run 1 nodes
    const cwd = path.join(process.cwd(), "..");
    const fixed = `--from=node0 --home=./nodes/node0/quarixd/ --keyring-backend=test --chain-id=quarix_8888888-1 --gas="auto" -y`;
    const erc20Address = "0x80b5a32E4F032B2a058b4F29EC95EEfEEB87aDcd";
    const receiver = "quarix1qqqqhe5pnaq5qq39wqkn957aydnrm45sywg476"; // "0x00000Be6819f41400225702D32d3dd23663Dd690";
    let cmd;
    let reply;

    {
      cmd = `./quarixd tx gov submit-legacy-proposal register-coin ./scripts/proposal/metadata.json --title="register qrx coin" --description="register qrx coin to erc20" --deposit="10000000aqrx" ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
      await sleep(1500);
    }

    {
      cmd = `./quarixd tx gov vote 1 yes ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
      await sleep(9000);
    }

    {
      // native coin => erc20 tokon
      cmd = `./quarixd tx erc20 convert-coin ${web3.utils.toWei("8")}aqrx ${erc20Address} ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
      await sleep(1500);
    }

    {
      // erc20 tokon => native coin
      cmd = `./quarixd tx erc20 convert-erc20 ${erc20Address} ${web3.utils.toWei("2")} ${receiver} ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
      await sleep(1500);
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
