export interface ReconPaystackRow {
  reference: string;
  email: string;
  amountNaira: number;
  paidAt: string | null;
  /** Golden join key: Splynx customer id from Paystack metadata.customer_id. */
  splynxCustomerId?: string | null;
}

export interface ReconSplynxRow {
  id: string;
  reference: string;
  email: string;
  amountNaira: number;
  paidAt: string | null;
  customerId?: string | null;
}
