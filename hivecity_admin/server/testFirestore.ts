
import { firestore } from "./firebaseAdmin";

async function testFirestoreConnection() {
    try {
        console.log("Connecting to Hivecity Firestore...");

        const snapshot = await firestore.collection("users").limit(5).get();

        console.log("Firestore connection successful!");
        console.log("Documents found:", snapshot.size);

        snapshot.forEach((doc) => {
            const data = doc.data();

            console.log({
                documentId: doc.id,
                uid: data.uid ? "Present" : "Missing",
                email: data.email ? "Present" : "Missing",
                name: data.name ? "Present" : "Missing",
                provider: data.provider ?? "Not available",
            });
        });
    } catch (error) {
        console.error("Firestore connection failed:", error);
        process.exitCode = 1;
    }
}

testFirestoreConnection();
