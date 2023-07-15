import { createPromiseClient } from "@bufbuild/connect";
import { Query } from "@buf/cosmos_cosmos-sdk.bufbuild_connect-es/cosmos/auth/v1beta1/query_connect.js";
import { ABCIApplication } from "@buf/cosmos_cosmos-sdk.bufbuild_connect-es/tendermint/abci/types_connect.js";
import { createGrpcTransport, createGrpcWebTransport, Http2SessionManager } from "@bufbuild/connect-node";
import { BaseAccount } from "@buf/cosmos_cosmos-sdk.bufbuild_es/cosmos/auth/v1beta1/auth_pb.js";
// import { createConnectTransport } from "@bufbuild/connect-web";

const transport = createGrpcTransport({
  baseUrl: "http://127.0.0.1:9090",
  httpVersion: "2",
  idleConnectionTimeoutMs: 10,
});

const tendermintTransport = createGrpcTransport({
  baseUrl: "http://127.0.0.1:26657",
  httpVersion: "2",
  idleConnectionTimeoutMs: 10,
});

async function main() {
  const client = createPromiseClient(Query, transport);
  const tendermint = createPromiseClient(ABCIApplication, tendermintTransport);
  let res;
  res = await client.accounts({
    "pagination.offset": 0,
    "pagination.limit": 40,
    "pagination.count_total": true,
  });
  console.log(res.accounts[0], res.accounts.length);

  res = await tendermint.echo({ message: "hello" });
  console.log(res);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
