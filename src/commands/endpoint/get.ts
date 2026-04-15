import { Command } from "@oclif/command";
import { CliUx } from "@oclif/core";
import { network } from "../../storage/networks";
import { config } from "../../storage/config";

export default class GetNetwork extends Command {
  static description = "Get Current enpoint";

  static aliases = ["endpoint"];

  async run() {
    const chain = config.get("currentChain");
    CliUx.ux.log(`Current Endpoint for ${chain}:`);
    CliUx.ux.styledJSON(network.network.endpoints);
  }

  async catch(e: Error) {
    CliUx.ux.styledJSON(e);
  }
}
