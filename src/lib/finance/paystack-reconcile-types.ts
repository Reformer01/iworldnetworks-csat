export interface ReconPaystackRow {
  reference: string;
  email: string;
  amountNaira: number;
  paidAt: string | null;
}

export interface ReconSplynxRow {
  id: string;
  reference: string;
  email: string;
  amountNaira: number;
  paidAt: string | null;
}
