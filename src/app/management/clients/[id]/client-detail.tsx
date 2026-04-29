"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Plus,
  MapPin,
  Buildings as BuildingsIcon,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import {
  getBuildingsByClient,
  getUnitsByBuilding,
} from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { Input } from "@/components/ui/input";
import { createBuilding, updateClient, deleteClient } from "@/app/actions/management-actions";
import { UserRole } from "@/lib/auth";

interface ClientDetailProps {
  data: AppDataset;
  userRole?: UserRole;
}

export function ClientDetail({ data, userRole }: ClientDetailProps) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const client = data.clients.find((c) => c.id === id);
  const [showForm, setShowForm] = useState(false);
  const [bName, setBName] = useState("");
  const [bAddress, setBAddress] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, startTransition] = useTransition();

  const [showEditForm, setShowEditForm] = useState(false);
  const [editName, setEditName] = useState(client?.name || "");
  const [editContact, setEditContact] = useState(client?.contactName || "");
  const [editEmail, setEditEmail] = useState(client?.contactEmail || "");
  const [editPhone, setEditPhone] = useState(client?.contactPhone || "");
  const [editError, setEditError] = useState("");
  const [isUpdating, startUpdateTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);

  if (!client) {
    return <div className="p-6 text-center text-muted">Client not found</div>;
  }

  const clientBuildings = getBuildingsByClient(data, client.id);

  const handleCreateBuilding = () => {
    if (!bName.trim()) {
      setFormError("Building name is required");
      return;
    }
    setFormError("");
    startTransition(async () => {
      const result = await createBuilding(client.id, bName, bAddress);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setBName("");
      setBAddress("");
      setShowForm(false);
      window.location.reload();
    });
  };

  const handleEditClient = () => {
    if (!editName.trim()) {
      setEditError("Client name is required");
      return;
    }
    if (!client) return;
    setEditError("");
    startUpdateTransition(async () => {
      const result = await updateClient(client.id, editName, editContact, editEmail, editPhone);
      if (!result.ok) {
        setEditError(result.error);
        return;
      }
      setShowEditForm(false);
      window.location.reload();
    });
  };

  const handleDeleteClient = () => {
    if (!client) return;
    if (window.confirm("Are you sure you want to delete this client? This process cannot be undone and will delete all associated buildings and units.")) {
      setIsDeleting(true);
      startUpdateTransition(async () => {
        const result = await deleteClient(client.id);
        if (!result.ok) {
          setEditError(result.error);
          setIsDeleting(false);
          return;
        }
        router.push("/management/clients");
      });
    }
  };

  return (
    <div className="flex flex-col">
      <PageHeader
        title={client.name}
        subtitle={`${client.contactName} \u2022 ${client.contactPhone}`}
        backHref="/management/clients"
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton />
            <Button size="sm" variant="secondary" onClick={() => setShowEditForm(!showEditForm)}>
              <PencilSimple size={14} weight="bold" />
              Edit
            </Button>
            {userRole === "owner" && (
              <Button 
                size="sm" 
                variant="danger" 
                onClick={handleDeleteClient}
                disabled={isUpdating || isDeleting}
              >
                <Trash size={14} weight="bold" />
                Delete
              </Button>
            )}
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus size={14} weight="bold" />
              Building
            </Button>
          </div>
        }
      />

      {showEditForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-4 pt-4"
        >
          <div className="bg-white rounded-2xl border border-border p-4 flex flex-col gap-3">
            <SectionLabel as="h3" noMargin>Edit Client</SectionLabel>
            {editError && (
              <p className="text-xs text-red-600">{editError}</p>
            )}
            <Input label="Business Name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="e.g. Acme Corp" autoFocus />
            <Input label="Contact Name" value={editContact} onChange={(e) => setEditContact(e.target.value)} placeholder="e.g. Jane Doe" />
            <Input label="Contact Email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="jane@example.com" />
            <Input label="Contact Phone" type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="(555) 123-4567" />
            
            <div className="flex items-center justify-end mt-2 pt-3 border-t border-border-subtle">
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setShowEditForm(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={isUpdating || isDeleting || !editName.trim()} onClick={handleEditClient}>
                  {isUpdating && !isDeleting ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {showForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-4 pt-4"
        >
          <div className="bg-white rounded-2xl border border-border p-4 flex flex-col gap-3">
            <SectionLabel as="h3" noMargin>New building</SectionLabel>
            {formError && (
              <p className="text-xs text-red-600">{formError}</p>
            )}
            <Input label="Building Name" value={bName} onChange={(e) => setBName(e.target.value)} placeholder="The Weston Residences" autoFocus />
            <Input label="Address" value={bAddress} onChange={(e) => setBAddress(e.target.value)} placeholder="240 Weston Rd, Toronto, ON" />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={pending || !bName.trim()} onClick={handleCreateBuilding}>
                {pending ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      <div className="px-4 py-4 flex flex-col gap-3">
        {clientBuildings.map((building, i) => {
          const bUnits = getUnitsByBuilding(data, building.id);
          const activeUnits = bUnits.filter((u) => u.status !== "installed");
          const assignedInstallers = new Set(
            bUnits.filter((u) => u.assignedInstallerName).map((u) => u.assignedInstallerName)
          );

          return (
            <motion.div
              key={building.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: i * 0.06,
                duration: 0.3,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Link href={`/management/buildings/${building.id}`}>
                <div className="bg-white rounded-2xl border border-border group p-4 hover:border-zinc-300 transition-all active:scale-[0.99]">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center">
                        <BuildingsIcon size={18} className="text-zinc-500" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-900 tracking-tight">
                          {building.name}
                        </h3>
                        <div className="flex items-center gap-1 text-xs text-muted mt-0.5">
                          <MapPin size={10} />
                          {building.address}
                        </div>
                      </div>
                    </div>
                      <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center -mr-1 shadow-sm group-hover:shadow-md transition-shadow">
                        <ArrowRight size={16} weight="bold" className="text-white" />
                      </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted border-t border-border pt-3 mt-3">
                    <span>
                      <span className="font-mono font-semibold text-zinc-700">{bUnits.length}</span>{" "}
                      units
                    </span>
                    <span>
                      <span className="font-mono font-semibold text-accent">{activeUnits.length}</span>{" "}
                      active
                    </span>
                    <span>
                      <span className="font-mono font-semibold text-zinc-700">{assignedInstallers.size}</span>{" "}
                      installers
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}


      </div>
    </div>
  );
}
