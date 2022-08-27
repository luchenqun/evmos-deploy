import path from "path";
import { execPromis } from "./utils.js";

let run = async function () {
  try {
    const dir = path.join(process.cwd(), "nodes");
    if (process.argv.length == 3) {
      const argv = process.argv[2].split(",");
      for (let i = 0; i < argv.length; i++) {
        const script = path.join(dir, process.platform == "win32" ? `stop${argv[i]}.bat` : `stop${argv[i]}.sh`);
        const { stdout, stderr } = await execPromis(script, { cwd: dir });
        console.log(`${stdout}${stderr}`);
      }
    } else {
      const script = path.join(dir, process.platform == "win32" ? "stopAll.vbs" : "stopAll.sh");
      const { stdout, stderr } = await execPromis(script, { cwd: dir });
      console.log(`${stdout}${stderr}`);
    }
  } catch (error) {
    console.log("error", error.stderr);
  }
};

run();
