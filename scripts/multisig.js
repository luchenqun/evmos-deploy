import path from "path";
import { decodeReply, execPromis, sleep } from "../utils.js";

let run = async function () {
  try {
    // you should use cmd `node init.js --v=1 --s=true` to run 1 nodes
    const cwd = path.join(process.cwd(), "..");
    const fixed = `--from=node0 --home=./nodes/node0/quarixd/ --gas-prices 20000000000aqare --gas="auto" -y`;
    const home = ` --home=./nodes/node0/quarixd/`;
    const multi = `multi`;
    const multiSigAddress = `quarix1kcvmvwaeuyhepke5t2wan2h74f4kw9nxusprxl`;
    const receiveAddress = `quarix1qqqqhe5pnaq5qq39wqkn957aydnrm45sywg476`;
    const unsignFile = `unsignedTx.json`;
    const a1sig = `a1sig.json`;
    const a2sig = `a2sig.json`;
    const signedFile = `signedTx.json`;
    let cmd;
    let reply;
    {
      // add multisig pk
      // quarix1kcvmvwaeuyhepke5t2wan2h74f4kw9nxusprxl
      // ./quarixd keys add --multisig=a1,a2,a3 --multisig-threshold=2 multi  --home=./nodes/node0/quarixd/
      cmd = `./quarixd keys add --multisig=a1,a2,a3 --multisig-threshold=2 ${multi} ${home}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }

    {
      // add unsign file
      // ./quarixd tx bank send quarix1kcvmvwaeuyhepke5t2wan2h74f4kw9nxusprxl quarix1qqqqhe5pnaq5qq39wqkn957aydnrm45sywg476 1000000000000000000aqrx --gas=auto  --home=./nodes/node0/quarixd/ --generate-only > unsignedTx.json
      cmd = `./quarixd tx bank send ${multiSigAddress} ${receiveAddress} 10000000000000000000aqrx --gas=500000 --gas-prices 20000000000aqare ${home} --generate-only > ${unsignFile}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }

    // {
    //   // add unsign file
    //   // ./quarixd tx bank mint-coins multi 1aqrx,1aqare --gas=500000 --gas-prices 20000000000aqare --home=./nodes/node0/quarixd/ --generate-only > unsignedTx.json
    //   cmd = `./quarixd tx bank mint-coins ${multi} 1aqrx,1aqare --gas=500000 --gas-prices 20000000000aqare ${home} --generate-only > ${unsignFile}`;
    //   reply = await execPromis(cmd, { cwd });
    //   console.log(cmd, "\n", decodeReply(reply));
    // }

    {
      // a1 sign
      // ./quarixd tx sign unsignedTx.json --multisig=multi --from=a1 --output-document=a1sig.json  --home=./nodes/node0/quarixd/
      cmd = `./quarixd tx sign ${unsignFile} --multisig=${multi} --from=a1 --output-document=${a1sig} ${home}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }

    {
      // a2 sign
      // ./quarixd tx sign unsignedTx.json --multisig=multi --from=a2 --output-document=a2sig.json  --home=./nodes/node0/quarixd/
      cmd = `./quarixd tx sign ${unsignFile} --multisig=${multi} --from=a2 --output-document=${a2sig} ${home}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }

    {
      // multisign
      // ./quarixd tx multisign unsignedTx.json multi a1sig.json a2sig.json --output-document=signedTx.json  --home=./nodes/node0/quarixd/ > signedTx.json
      cmd = `./quarixd tx multisign ${unsignFile} ${multi} ${a1sig} ${a2sig} --output-document=${signedFile} ${home} > ${signedFile}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }

    {
      // broadcast
      // ./quarixd tx broadcast signedTx.json --broadcast-mode=block  --home=./nodes/node0/quarixd/
      cmd = `./quarixd tx broadcast ${signedFile} --broadcast-mode=block ${home}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
