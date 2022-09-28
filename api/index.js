import http from "./http.js";
export default class API {
  constructor(api, rpc) {
    this.api = api;
    this.rpc = rpc;
  }
  async health() {
    return http.get(`${this.rpc}/health`);
  }
  async status() {
    return http.get(`${this.rpc}/status`);
  }
  async validators() {
    return http.get(`${this.rpc}/validators`);
  }
  async evmosValidators() {
    return http.get(`${this.api}/cosmos/staking/v1beta1/validators`);
  }
  async netInfo() {
    return http.get(`${this.rpc}/net_info`);
  }
  async unconfirmedTxs() {
    return http.get(`${this.rpc}/num_unconfirmed_txs`);
  }
  async blockchain(minHeight, maxHeight) {
    if (minHeight == undefined || maxHeight == undefined) {
      return http.get(`${this.rpc}/blockchain`);
    } else {
      return http.get(`${this.rpc}/blockchain?minHeight=${minHeight}&maxHeight=${maxHeight}`);
    }
  }
  async authAccount(address) {
    return http.get(`${this.api}/cosmos/auth/v1beta1/accounts/${address}`);
  }
  async txCommit(tx) {
    return http.get(`${this.rpc}/broadcast_tx_commit`, { tx });
  }
  async genesis() {
    return http.get(`${this.rpc}/genesis`);
  }
  async stakingParams() {
    return http.get(`${this.api}/cosmos/staking/v1beta1/params`);
  }
}
