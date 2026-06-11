import { Command } from "@oclif/command";
import { CliUx } from "@oclif/core";
import { network } from "../../storage/networks";
import { config } from "../../storage/config";

export default class GetNetwork extends Command {
  static description = "Get Current enpoint";

  static aliases = ["endpoint"];

  async run() {
    // The "endpoint" alias shadows the endpoint:* topic, so "endpoint set X"
    // lands HERE with ["set","X"] as argv and used to silently print the
    // current endpoint instead of setting anything. Redirect with an error.
    const extra = this.argv.filter((a) => !a.startsWith("-"));
    if (extra.length) {
      this.error(`unknown argument "${extra.join(" ")}" — did you mean \`endpoint:${extra[0]}\`?`);
    }
    const chain = config.get("currentChain");
    CliUx.ux.log(`Current Endpoint for ${chain}:`);
    CliUx.ux.styledJSON(network.network.endpoints);
  }

  async catch(e: Error) {
    throw e; // let oclif render the message (styledJSON hid this.error output)
  }
}
