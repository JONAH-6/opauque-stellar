import React from "react";
import { useSecurityStore } from "../../store/securityStore";

export const MainnetSafetyBanner: React.FC = () => {
  const { expectedNetwork } = useSecurityStore();

  if (expectedNetwork !== "mainnet") return null;

  return (
    <div className="bg-black text-white border-b border-white p-3 text-center font-bold sticky top-0 z-50">
      ⚠️ YOU ARE ON MAINNET ⚠️ Real funds are at risk. Always verify your network and passphrase.
    </div>
  );
};
