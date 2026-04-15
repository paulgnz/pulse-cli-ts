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

    if (!args.chain) {
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
    network.overrideEndpoint(args.endpoint);
  }

  async catch(e: Error) {
    CliUx.ux.error(e);
  }
}
