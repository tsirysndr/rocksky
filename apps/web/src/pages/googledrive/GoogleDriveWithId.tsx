import { useParams } from "@tanstack/react-router";
import GoogleDrive from "./GoogleDrive";

function GoogleDriveWithId() {
  const { id } = useParams({ strict: false });
  return <GoogleDrive fileId={id} />;
}

export default GoogleDriveWithId;
