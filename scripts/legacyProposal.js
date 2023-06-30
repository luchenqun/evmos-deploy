import path from "path";
import { decodeReply, execPromis, sleep } from "../utils.js";

let run = async function () {
  try {
    // you should use cmd `node init.js --v=1 --s=true` to run 1 nodes
    const cwd = path.join(process.cwd(), "..");
    const fixed = `--from=node0 --home=./nodes/node0/quarixd/ --keyring-backend=test --chain-id=quarix_8888888-1 --gas-prices 2000000000aqare --gas="auto" -y`;
    let cmd;
    let reply;
    {
      await sleep(3000); // wait the pre transaction to success
      // submit-proposal param-change
      cmd = `./quarixd tx gov submit-legacy-proposal param-change ./scripts/proposal/legacyProposal.json ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));

      await sleep(3000);

      // vote yes ./scripts/proposal.json
      cmd = `./quarixd tx gov vote 5 yes ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
