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

    // No endpoint passed -> interactive picker. (Was `args.chain`, which
    // never exists on this command, so an explicit endpoint was ignored.)
    if (!args.endpoint) {
      const chain = network.network.chain;
      const chainDiscoveryService = EP_DISCOVERY.find(
        (api: ChainDiscoveryService) => api.chain === chain
      );
      if (chainDiscoveryService) {
        // A discovery service exists -> fetch the live node list.
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
      } else {
        // No discovery service -> pick from the chain's known endpoints in
        // constants (the validator pool, etc.), or enter a custom URL.
        const stock = networks.find((n) => n.chain === chain);
        const known = stock?.endpoints ?? [];
        const CUSTOM = "↳ custom URL…";
        const responses: any = await inquirer.prompt([
          {
            name: "endpoint",
            message: `Choose an endpoint for ${chain}`,
            type: "list",
            pageSize: 10,
            choices: [...known, CUSTOM],
          },
        ]);
        if (responses.endpoint === CUSTOM) {
          const custom: any = await inquirer.prompt([
            { name: "url", message: "Endpoint URL", type: "input" },
          ]);
          args.endpoint = custom.url;
        } else {
          args.endpoint = responses.endpoint;
        }
      }
    }
    // inquirer's checkbox returns an array; a CLI arg is a single string.
    const list = Array.isArray(args.endpoint) ? args.endpoint : [args.endpoint];
    network.overrideEndpoint(list);
  }

  async catch(e: Error) {
    CliUx.ux.error(e);
  }
}
