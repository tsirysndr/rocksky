import styled from "@emotion/styled";
import { LabelMedium } from "baseui/typography";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { useNavigate } from "react-router";
import { profileAtom } from "../../atoms/profile";
import Dropbox from "../../components/Icons/Dropbox";
import GoogleDrive from "../../components/Icons/GoogleDrive";
import { API_URL } from "../../consts";
import DropboxBeta from "./DropboxBeta";
import GoogleDriveBeta from "./GoogleDriveBeta";

const MenuItem = styled.div`
  display: flex;
  justify-content: space-between;
  height: 50px;
  align-items: center;
  border-radius: 8px;
  padding-left: 15px;
  padding-right: 15px;
  cursor: pointer;
`;

function CloudDrive() {
  const profile = useAtomValue(profileAtom);
  const navigate = useNavigate();
  const [isGoogleDriveBetaModalOpen, setIsGoogleDriveBetaModalOpen] =
    useState(false);
  const [isDropboxBetaModalOpen, setIsDropboxBetaModalOpen] = useState(false);

  const onSelectGoogleDrive = async () => {
    const did = localStorage.getItem("did");
    if (!did) {
      return;
    }

    if (profile?.googledriveUser?.isBeta) {
      navigate("/googledrive");
      return;
    }

    if (profile!.did !== "did:plc:7vdlgi2bflelz7mmuxoqjfcr") {
      setIsGoogleDriveBetaModalOpen(true);
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

    if (profile?.dropboxUser?.isBeta) {
      navigate("/dropbox");
      return;
    }

    if (profile!.did !== "did:plc:7vdlgi2bflelz7mmuxoqjfcr") {
      setIsDropboxBetaModalOpen(true);
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
    <div className="mt-[30px]">
      <LabelMedium marginBottom="15px" className="!text-[var(--color-text)]">
        Cloud Drive
      </LabelMedium>
      <MenuItem
        onClick={onSelectGoogleDrive}
        className="hover:bg-[var(--color-menu-hover)]"
      >
        <div className="mt-[5px]">
          <GoogleDrive />
        </div>
        <div className="flex ml-[15px] mb-[5px] flex-1">Google Drive</div>
      </MenuItem>
      <MenuItem
        onClick={onSelectDropbox}
        className="hover:bg-[var(--color-menu-hover)]"
      >
        <div className="mt-[5px]">
          <Dropbox />
        </div>
        <div className="flex ml-[15px] mb-[5px] flex-1">Dropbox</div>
      </MenuItem>
      <GoogleDriveBeta
        isOpen={isGoogleDriveBetaModalOpen}
        close={() => setIsGoogleDriveBetaModalOpen(false)}
      />
      <DropboxBeta
        isOpen={isDropboxBetaModalOpen}
        close={() => setIsDropboxBetaModalOpen(false)}
      />
    </div>
  );
}

export default CloudDrive;
