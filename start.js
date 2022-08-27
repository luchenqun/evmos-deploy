import fs from "fs-extra";
import path from "path";
import { execPromis } from "./utils.js";

let run = async function () {
  try {
    const platform = process.platform;
    const dir = path.join(process.cwd(), "nodes");
    if (process.argv.length == 3) {
      let vbsStart = platform == "win32" ? `set ws=WScript.CreateObject("WScript.Shell")\n` : `#!/bin/bash\n`;
      const argv = process.argv[2].split(",");
      for (let i = 0; i < argv.length; i++) {
        if (platform == "win32") {
          vbsStart += `ws.Run ".\\start${argv[i]}.bat",0\n`;
        } else {
          vbsStart += `./start${argv[i]}.sh\n`;
        }
      }

      const script = path.join(dir, `startTemp.` + (platform == "win32" ? "vbs" : "sh"));
      await fs.writeFile(script, vbsStart);
      const { stdout, stderr } = await execPromis(script, { cwd: dir });
      console.log(`${stdout}${stderr}`);
      await fs.remove(script);
    } else {
      const script = path.join(dir, platform == "win32" ? "startAll.vbs" : "startAll.sh");
      const { stdout, stderr } = await execPromis(script, { cwd: dir });
      console.log(`${stdout}${stderr}`);
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
