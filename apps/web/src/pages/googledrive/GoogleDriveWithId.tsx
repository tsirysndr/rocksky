import { useParams } from "react-router";
import GoogleDrive from "./GoogleDrive";

function GoogleDriveWithId() {
  const { id } = useParams<{ id: string }>();
  return <GoogleDrive fileId={id} />;
}

export default GoogleDriveWithId;
