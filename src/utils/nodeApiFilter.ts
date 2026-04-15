type NodeApi = {
  url: string;
};
export const nodeApiFilter = (nodeApis: NodeApi[]): string[] => {
  return nodeApis.map((node) => node.url);
};
