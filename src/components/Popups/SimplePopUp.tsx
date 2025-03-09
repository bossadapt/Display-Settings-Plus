import "./SimplePopUp.css";

interface SimplePopUpProps {
    showSimplePopUp: boolean,
    reasonForPopUp: string
}
export const SimplePopUp: React.FC<SimplePopUpProps> = ({ showSimplePopUp, reasonForPopUp }) => {
    return (
        <div className="simplePopup" style={{ display: showSimplePopUp ? "block" : "none" }}>
            <div className="simplePopUpContents">
                <div className="simpleLoader"></div>
                <h1 className="simplePopUpText">{reasonForPopUp}</h1>
            </div>
        </div>
    );
};
export default SimplePopUp;