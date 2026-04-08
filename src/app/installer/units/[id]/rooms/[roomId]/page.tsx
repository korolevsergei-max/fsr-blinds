"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAppDataset } from "@/lib/dataset-context";
import { fetchUnitMedia } from "@/app/actions/dataset-queries";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { RoomDetail } from "./room-detail";

export default function InstallerRoomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useAppDataset();
  const [mediaItems, setMediaItems] = useState<UnitStageMediaItem[]>([]);

  useEffect(() => {
    fetchUnitMedia(id).then(setMediaItems);
  }, [id]);

  return <RoomDetail data={data} mediaItems={mediaItems} />;
}
