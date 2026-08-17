const fs = require('fs');

const files = [
    "C:\\Snabbb-AIBoard\\AIBoard\\VirtualPet\\context\\GameStateContext.tsx",
    "C:\\Snabbb-app\\snabb-superapp\\VirtualPet\\context\\GameStateContext.tsx",
    "C:\\Snabbb-Appointment\\appointment\\src\\VirtualPet\\context\\GameStateContext.tsx",
    "C:\\Snabbb-Calculator\\calculator\\VirtualPet\\context\\GameStateContext.tsx",
    "C:\\Snabbb-Elearning\\E-learning\\src\\VirtualPet\\context\\GameStateContext.tsx",
    "C:\\Snabbb-ImageGenerator\\Image-generator\\src\\VirtualPet\\context\\GameStateContext.tsx",
    "C:\\Snabbb-Inventory\\inventory\\VirtualPet\\context\\GameStateContext.tsx",
    "C:\\Snabbb-Todo\\todo\\VirtualPet\\context\\GameStateContext.tsx"
];

const target = `                setActiveBedId(petData.active_bed_id || null);
            }

            const { error: soapCleanupErr } = await supabase`;

const replacement = `                setActiveBedId(petData.active_bed_id || null);
            } else if (!petData && !petErr) {
                // New user - reset to default stats to avoid inheriting local storage from a previous user
                setStats(INITIAL_STATS);
                setPetName(DEFAULT_PET_ID);
                setInventory(INITIAL_INVENTORY);
                setIsSleeping(false);
                setActiveBallId('ball_red');
                setActiveBedId(null);
            }

            const { error: soapCleanupErr } = await supabase`;

let errorCount = 0;

for (const file of files) {
    try {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes(target)) {
            const updated = content.replace(target, replacement);
            fs.writeFileSync(file, updated, 'utf8');
            console.log("Updated: " + file);
        } else if (content.includes("else if (!petData && !petErr)")) {
            console.log("Already updated: " + file);
        } else {
            console.log("Target string not found in: " + file);
            errorCount++;
        }
    } catch (e) {
        console.error("Error processing " + file + ": ", e);
        errorCount++;
    }
}

if (errorCount > 0) {
    process.exit(1);
} else {
    console.log("Done.");
}
