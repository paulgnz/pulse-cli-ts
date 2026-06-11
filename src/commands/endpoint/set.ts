import { Command } from "@oclif/command";
import { CliUx, Flags } from "@oclif/core";
import { network } from "../../storage/networks";
import { config } from "../../storage/config";
import * as inquirer from "inquirer";
import { ChainDiscoveryService, EP_DISCOVERY, networks } from "../../constants";
import { nodeApiFilter } from "../../utils/nodeApiFilter";
import { green } from "colors";

export default class SetEnpoint extends Command {
  static description = "Set current enpoint";

  static args = [
    { name: "endpoint", required: false, description: "Specific endpoint" },
  ];

  async run() {
    const { args } = this.parse(SetEnpoint);

    // No endpoint passed -> interactive discovery. (Was `args.chain`, which
    // never exists on this command, so an explicit endpoint was ignored.)
    if (!args.endpoint) {
      const chain = network.network.chain;
      const chainDiscoveryService = EP_DISCOVERY.find(
        (api: ChainDiscoveryService) => api.chain === chain
      );
      if (!chainDiscoveryService)
        throw new Error("Chain discovery service not found");
      const availableEndpointsQery = await fetch(
        chainDiscoveryService?.service_url
      );
      const availableEndpoints = await availableEndpointsQery.json();
      const availableEndpointsList = nodeApiFilter(availableEndpoints);
      const responses: any = await inquirer.prompt([
        {
          name: "endpoint",
          message: "Specify a endpoint",
          type: "checkbox",
          pageSize: 10,
          choices: [...availableEndpointsList],
        },
      ]);
      args.endpoint = responses.endpoint;
    }
    // inquirer's checkbox returns an array; a CLI arg is a single string.
    const list = Array.isArray(args.endpoint) ? args.endpoint : [args.endpoint];
    network.overrideEndpoint(list);
  }

  async catch(e: Error) {
    CliUx.ux.error(e);
  }
}
