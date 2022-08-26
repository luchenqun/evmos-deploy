import path from "path";
import { decodeReply, execPromis, sleep } from "../utils.js";

let run = async function () {
  try {
    // you should use cmd `node init.js --v=1 --s=true` to run 1 nodes
    const cwd = path.join(process.cwd(), "..");
    const fixed = `--from=evmos1hajh6rhhkjqkwet6wqld3lgx8ur4y3khjuxkxh --home=./nodes/node0/evmosd/ --keyring-backend=test --chain-id=evmos_20191205-1 -y`;
    let cmd;
    let reply;

    {
      // deposit with aevmos, though deposit evmos is great than min deposit, but the status is deposit period
      cmd = `./evmosd tx gov submit-proposal --title="Test Proposal 01" --description="desc test" --type="Text" --deposit="10000000aevmos" ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));

      await sleep(1000 * 10);

      // deposit with agov, deposit agov is greater than min deposit, so the status is vote period
      cmd = `./evmosd tx gov deposit 1 10000000agov ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }

    {
      await sleep(3000); // wait the pre transaction to success
      // deposit with agov, but deposit agov is less than min deposit, so the status is deposit period
      cmd = `./evmosd tx gov submit-proposal --title="Test Proposal 02" --description="desc test" --type="Text" --deposit="9000000agov" ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));

      await sleep(1000 * 10);

      // deposit with agov, deposit agov is greater than min deposit, so the status is vote period
      cmd = `./evmosd tx gov deposit 2 1000000agov ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }

    {
      await sleep(3000); // wait the pre transaction to success
      // vote yes
      cmd = `./evmosd tx gov vote 1 yes ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));

      await sleep(3000);

      // vote no
      cmd = `./evmosd tx gov vote 2 no ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }

    {
      await sleep(3000); // wait the pre transaction to success
      // submit-proposal param-change
      cmd = `./evmosd tx gov submit-proposal param-change ./scripts/proposal.json ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));

      await sleep(3000);

      // vote yes ./scripts/proposal.json
      cmd = `./evmosd tx gov vote 3 yes ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
