import { useParams } from "@tanstack/react-router";
import GoogleDrive from "./GoogleDrive";

function GoogleDriveWithId() {
  const { id } = useParams({ from: "/googledrive/$id" });
  return <GoogleDrive fileId={id} />;
}

export default GoogleDriveWithId;
