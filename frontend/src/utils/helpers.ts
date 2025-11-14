// Utility functions for the app

export const formatCurrency = (amount: number) => `₹${amount.toFixed(2)}`;

export const formatDate = (date: string) => {
  const d = new Date(date);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const simulatePayment = async (amount: number): Promise<boolean> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const success = Math.random() > 0.2;
      resolve(success);
    }, 2000);
  });
};

export const generateTicket = (booking: {
  movie: string;
  seats: string[];
  total: number;
  date: string;
  time: string;
}) => {
  const ticketId = `TCK-${Math.floor(Math.random() * 1000000)}`;
  return {
    ...booking,
    ticketId,
    generatedAt: new Date().toISOString(),
  };
};
