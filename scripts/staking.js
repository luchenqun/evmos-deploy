import fs from "fs-extra";
import path from "path";
import { decodeReply, execPromis, sleep } from "../utils.js";

let run = async function () {
  try {
    // you should use cmd `node init.js --v=4 --cn=1 --s=true` to run 5 nodes

    const cwd = path.join(process.cwd(), "..");
    const node = "node4"; // insure this address from ${node}/quarixd/key_seed.json, have great than 100000000000000000000 aqrx
    const privValidatorKey = await fs.readJSON(path.join(cwd, `nodes/${node}/quarixd/config/priv_validator_key.json`));
    const keySeedValidator = await fs.readJSON(path.join(cwd, `nodes/${node}/quarixd/key_seed.json`));
    const valAddress = keySeedValidator.valAddress;
    const ippId = 1;
    const pubkey = `'{"@type":"/cosmos.crypto.ed25519.PubKey","key":"${privValidatorKey.pub_key.value}"}'`; // usd cmd `./quarixd tendermint show-validator --home=./nodes/${node}/quarixd`
    const fixed1 = `--gas-prices 20000000000aqare --gas="auto" --from=${node} --home=./nodes/${node}/quarixd/ --keyring-backend=test --chain-id=quarix_8888888-1 -y`;
    const fixed2 = `--gas-prices 20000000000aqare --gas="auto" --from=qoe --home=./nodes/node0/quarixd/ --keyring-backend=test --chain-id=quarix_8888888-1 -y`;

    let cmd;
    let reply;

    {
      cmd = `./quarixd tx staking allocate-investment-program-pool qoe ${valAddress} ${ippId} ${fixed2}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
      await sleep(2000);
    }

    {
      cmd = `./quarixd tx role assign-role Validator ${valAddress} ${fixed2}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
      await sleep(2000);
    }

    {
      cmd = `./quarixd tx staking create-validator --amount=90000000000000000000aqrx --commission-rate="0.05" --commission-max-rate="0.10" --commission-max-change-rate="0.01" --min-self-delegation="1" --pubkey=${pubkey} --moniker="${node}" ${fixed1}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
      await sleep(2000);
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
