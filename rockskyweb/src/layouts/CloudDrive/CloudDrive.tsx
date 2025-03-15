import styled from "@emotion/styled";
import { LabelMedium } from "baseui/typography";
import Dropbox from "../../components/Icons/Dropbox";
import GoogleDrive from "../../components/Icons/GoogleDrive";
import { API_URL } from "../../consts";

const MenuItem = styled.div`
  display: flex;
  justify-content: space-between;
  height: 50px;
  align-items: center;
  border-radius: 8px;
  padding-left: 15px;
  padding-right: 15px;
  cursor: pointer;
  &:hover {
    background-color: #f7f7f7;
  }
`;

function CloudDrive() {
  const onSelectGoogleDrive = async () => {
    const did = localStorage.getItem("did");
    if (!did) {
      return;
    }

    const response = await fetch(`${API_URL}/googledrive/login`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });
    const data = await response.json();
    if (data.authUrl) {
      window.location.href = data.authUrl;
    }
  };

  const onSelectDropbox = async () => {
    const did = localStorage.getItem("did");
    if (!did) {
      return;
    }

    const response = await fetch(`${API_URL}/dropbox/login`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });
    const data = await response.json();
    if (data.redirectUri) {
      window.location.href = data.redirectUri;
    }
  };

  return (
    <div style={{ marginTop: 30 }}>
      <LabelMedium marginBottom="15px">Cloud Drive</LabelMedium>
      <MenuItem onClick={onSelectGoogleDrive}>
        <div style={{ marginTop: 5 }}>
          <GoogleDrive />
        </div>
        <div style={{ flex: 1, marginLeft: 15, marginBottom: 5 }}>
          Google Drive
        </div>
      </MenuItem>
      <MenuItem onClick={onSelectDropbox}>
        <div style={{ marginTop: 5 }}>
          <Dropbox />
        </div>
        <div style={{ flex: 1, marginLeft: 15, marginBottom: 5 }}>Dropbox</div>
      </MenuItem>
    </div>
  );
}

export default CloudDrive;
