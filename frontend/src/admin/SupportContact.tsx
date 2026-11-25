import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Mail,
  Phone,
  MessageCircle,
  Camera,
  Users,
  Video,
  Send,
  Save,
  Headphones,
} from "lucide-react";
import adminApi from "../adminApi";

type SupportContactSettings = {
  email: string;
  phone: string;
  whatsappUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  youtubeUrl: string;
  telegramUrl: string;
};

const emptySettings: SupportContactSettings = {
  email: "",
  phone: "",
  whatsappUrl: "",
  instagramUrl: "",
  facebookUrl: "",
  youtubeUrl: "",
  telegramUrl: "",
};

const fields = [
  {
    key: "email",
    label: "Support Email",
    placeholder: "support@example.com",
    type: "email",
    description: "Customers can email your support team.",
    icon: Mail,
  },
  {
    key: "phone",
    label: "Support Phone",
    placeholder: "+91 9876543210",
    type: "tel",
    description: "Your customer support phone number.",
    icon: Phone,
  },
  {
    key: "whatsappUrl",
    label: "WhatsApp URL",
    placeholder: "https://wa.me/919876543210",
    type: "url",
    description: "Your WhatsApp chat or business link.",
    icon: MessageCircle,
  },
  {
    key: "instagramUrl",
    label: "Instagram URL",
    placeholder: "https://instagram.com/yourprofile",
    type: "url",
    description: "Your official Instagram profile.",
    icon: Camera,
  },
  {
    key: "facebookUrl",
    label: "Facebook URL",
    placeholder: "https://facebook.com/yourpage",
    type: "url",
    description: "Your official Facebook page.",
    icon: Users,
  },
  {
    key: "youtubeUrl",
    label: "YouTube URL",
    placeholder: "https://youtube.com/@yourchannel",
    type: "url",
    description: "Your official YouTube channel.",
    icon: Video,
  },
  {
    key: "telegramUrl",
    label: "Telegram URL",
    placeholder: "https://t.me/yourchannel",
    type: "url",
    description: "Your official Telegram channel or group.",
    icon: Send,
  },
] as const;

export default function SupportContact() {
  const [settings, setSettings] =
    useState<SupportContactSettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await adminApi.get(
        "/admin/vps/support/contact-settings"
      );

      setSettings({
        ...emptySettings,
        ...(response.data || {}),
      });
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Failed to load support contact settings."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await adminApi.put(
        "/admin/vps/support/contact-settings",
        settings
      );

      setSettings({
        ...emptySettings,
        ...(response.data || {}),
      });
      setMessage("Support and contact settings saved successfully.");
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Failed to save support contact settings."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[#C6A66B]">
            Customer Communication
          </p>
          <h2 className="font-serif text-2xl font-bold text-[#F1E9DA]">
            Support & Contact
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[#F1E9DA]/50">
            Manage the contact details and social channels displayed on your
            customer website.
          </p>
        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#C6A66B]/30 bg-[#C6A66B]/10 text-[#C6A66B]">
          <Headphones size={23} />
        </div>
      </div>

      <div className="rounded-xl border border-[#C6A66B]/20 bg-[#C6A66B]/5 p-4">
        <p className="text-sm font-semibold text-[#C6A66B]">
          Optional contact channels
        </p>
        <p className="mt-1 text-xs leading-5 text-[#F1E9DA]/60">
          Fill in only the channels you want customers to see. Leave a field
          empty to hide that contact option from the customer website. Saving
          empty fields clears previously saved values.
        </p>
      </div>

      {message && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[#332f2a] bg-[#201d1a] p-8 text-center text-sm text-[#F1E9DA]/50">
          Loading contact settings...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            {fields.map((field) => {
              const Icon = field.icon;

              return (
                <div
                  key={field.key}
                  className="rounded-xl border border-[#332f2a] bg-[#201d1a] p-5"
                >
                  <label
                    htmlFor={`support-${field.key}`}
                    className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#F1E9DA]"
                  >
                    <Icon size={17} className="text-[#C6A66B]" />
                    {field.label}
                    <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-[#F1E9DA]/30">
                      Optional
                    </span>
                  </label>

                  <input
                    id={`support-${field.key}`}
                    type={field.type}
                    value={settings[field.key]}
                    onChange={(event) =>
                      setSettings((previous) => ({
                        ...previous,
                        [field.key]: event.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    maxLength={field.key === "email" ? 254 : field.key === "phone" ? 30 : 500}
                    className="w-full rounded-lg border border-[#332f2a] bg-[#171717] px-4 py-3 text-sm text-[#F1E9DA] outline-none transition placeholder:text-[#F1E9DA]/25 focus:border-[#C6A66B]/60"
                  />

                  <p className="mt-2 text-[11px] text-[#F1E9DA]/40">
                    {field.description}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#332f2a] pt-5">
            <p className="text-xs text-[#F1E9DA]/40">
              Changes are saved to your existing system settings.
            </p>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#C6A66B] px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#171717] transition hover:bg-[#d8ba82] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={15} />
              {saving ? "Saving..." : "Save Contact Settings"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
