import { getAddress } from "ethers";

/** Address facade retained for the original view components. All values are EVM hex addresses. */
export class PublicKey {
  private readonly address: string;
  constructor(value: string | PublicKey) { this.address = getAddress(value.toString()); }
  toString() { return this.address; }
  toBase58() { return this.address; } // Legacy view method name; never base58 encodes.
  equals(other: PublicKey) { return this.address === other.address; }
}
