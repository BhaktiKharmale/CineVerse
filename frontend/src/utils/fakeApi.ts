export function simulateOTP(email: string): Promise<boolean> {
  return new Promise((res) => setTimeout(() => res(true), 2000));
}

export function simulatePayment(method: string): Promise<boolean> {
  return new Promise((res) => setTimeout(() => res(true), 2500));
}
