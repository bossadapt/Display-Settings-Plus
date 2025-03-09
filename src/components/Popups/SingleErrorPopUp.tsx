import { Dispatch, SetStateAction } from "react";
import "./SingleErrorPopUp.css";

export interface SingleError {
    showSingleError: boolean,
    setShowSingleError: Dispatch<SetStateAction<boolean>>,
    singleErrorText: string
    setSingleErrorText: Dispatch<SetStateAction<string>>
}
export const SingleErrorPopup: React.FC<SingleError> = ({ showSingleError, singleErrorText, setShowSingleError }) => {
    return (
        <div className="single-error-popup" style={{ display: showSingleError ? "block" : "none" }}>
            <div className="single-error-contents">
                <h1 className="single-error-popup-title">Failed</h1>
                <hr />
                <h3 className="single-error-text">{singleErrorText}</h3>
            </div>
            <button className="single-error-accept-button" onClick={() => { setShowSingleError(false) }}>Accept</button>
        </div>
    );
};
export default SingleErrorPopup;