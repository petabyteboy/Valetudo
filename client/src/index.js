import "./map/vacuum-map";
import "./fab.js";

const map = document.getElementById("vacuum-map");
document.getElementById("goto").onclick = () => {
	const point = map.getLocations().gotoPoints[0];
	fetch("../api/go_to", {
		method: "put",
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(point),
	}).then(res => res.text()).then(console.log);
};
