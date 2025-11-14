import React, { useMemo } from "react";
import Navbar from "../../components/layout/Navbar";
import Footer from "../../components/layout/Footer";
import OffersGrid from "../../components/offers/OffersGrid";
import { Offer } from "../../libs/types";
import { useNavigate } from "react-router-dom";

const LOCAL_OFFERS: Offer[] = [
  {
    id: "local-offer-1",
    title: "Cashback up to ₹250",
    description: "Pay with CinePay & get instant cashback on weekend bookings.",
    banner_url: "/offers/offer1.jpeg",
    valid_till: "Sun, Nov 30, 2025",
  },
  {
    id: "local-offer-2",
    title: "Buy 1 Get 1 Free",
    description: "Limited seats every Friday for CinePass members.",
    banner_url: "/offers/offer2.png",
    valid_till: "Fri, Sep 12, 2025",
  },
  {
    id: "local-offer-3",
    title: "Gourmet Combo @ ₹299",
    description: "Upgrade your snacks with handcrafted desserts & beverages.",
    banner_url: "/offers/offers2.jpg",
    valid_till: "Mon, Aug 10, 2026",
  },
  {
    id: "local-offer-4",
    title: "Passport Premium Lounge",
    description: "Passport holders get lounge access and concierge on blockbuster nights.",
    banner_url: "/offers/offers3.jpg",
    valid_till: "Tue, Dec 01, 2026",
  },
  {
    id: "local-offer-5",
    title: "Student Rush Tickets",
    description: "Show your student ID and grab weekday shows at flat ₹150.",
    banner_url: "/offers/offers4.jpg",
    valid_till: "Thu, Jul 23, 2026",
  },
  {
    id: "local-offer-6",
    title: "Family Showtime Bundle",
    description: "4 tickets + F&B combo at 25% OFF for evening shows.",
    banner_url: "/offers/offers5.jpg",
    valid_till: "Sat, Jan 30, 2027",
  },
];

const OffersPage: React.FC = () => {
  const navigate = useNavigate();

  const offers = useMemo(() => LOCAL_OFFERS, []);

  const handleViewOffer = (offer: Offer) => {
    const link = (offer as any).cta_url || (offer as any).link_url || (offer as any).url;
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
      return;
    }
    navigate("/home#offers");
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0b0b0f] text-white">
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="mb-10 flex flex-col gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.5em] text-[#f6c800]">
                CineVerse Exclusives
              </p>
              <h1 className="text-3xl font-semibold uppercase tracking-[0.35em] text-white md:text-4xl">
                Offers
              </h1>
              <p className="max-w-2xl text-sm text-gray-400">
                Unlock premium screenings, curated dining, and member-only rewards. Fresh perks drop every week, handpicked for your next movie night.
              </p>
            </div>
          </header>

          <section aria-label="Available offers" className="space-y-8">
            <OffersGrid offers={offers} onView={handleViewOffer} />
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default OffersPage;

