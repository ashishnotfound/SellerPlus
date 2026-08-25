"use client";

import React from "react";
import { ProfileSettings } from "./components/ProfileSettings";
import { NotificationSettings } from "./components/NotificationSettings";
import { LLMSettings } from "./components/LLMSettings";
import { TeamSettings } from "./components/TeamSettings";
import { AmazonAPISettings } from "./components/AmazonAPISettings";
import { AboutSellerPlus } from "./components/AboutSellerPlus";
import { AIBudgetSettings } from "./components/AIBudgetSettings";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">System Settings</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Configure profile configurations, API gateways, integrations, and workspace permissions.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Workspace and personal settings */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          <ProfileSettings />
          <TeamSettings />
        </div>
        
        {/* Product and notification settings */}
        <div className="flex flex-col gap-6">
          <NotificationSettings />
          <AboutSellerPlus />
        </div>
      </div>

      <LLMSettings />
      <AIBudgetSettings />
      <AmazonAPISettings />
    </div>
  );
}
