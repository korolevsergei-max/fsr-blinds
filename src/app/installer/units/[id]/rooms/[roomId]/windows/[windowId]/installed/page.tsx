"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAppDataset } from "@/lib/dataset-context";
import { fetchUnitMedia } from "@/app/actions/dataset-queries";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { InstalledPhotoForm } from "@/components/windows/installed-photo-form";

export default function InstallerInstalledPhotoPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useAppDataset();
  const [mediaItems, setMediaItems] = useState<UnitStageMediaItem[]>([]);

  useEffect(() => {
    fetchUnitMedia(id).then(setMediaItems);
  }, [id]);

  return <InstalledPhotoForm data={data} mediaItems={mediaItems} />;
}
