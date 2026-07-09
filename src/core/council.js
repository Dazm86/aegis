const fs = require("fs");
const path = require("path");
const { askRole } = require("../lib/openaiClient");
const { checkResponse } = require("./enforcer");
const { getActiveTextKey } = require("../lib/apiKeys");

const modelsConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "config", "models.json"), "utf8")
);

const constitution = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "config", "constitution.json"), "utf8")
);

async function runCouncil(mission, supabase) {
    const results = [];
    const allViolations = [];

    const override = supabase ? await getActiveTextKey(supabase) : null;
    if (override) {
        console.log(`🔑 Using stronger override model for council: ${override.model || "(default model for that provider)"}`);
    }

    for (const roleCfg of modelsConfig.roles) {
        if (!roleCfg.enabled) {
            console.log(`⏸️  Skipping suspended role: ${roleCfg.roleId}`);
            continue;
        }

        const roleInfo = constitution.roles.find(r => r.id === roleCfg.roleId) || {
            name: roleCfg.roleId,
            description: "No description available."
        };

        const result = await askRole({
            roleName: roleInfo.name,
            roleDescription: roleInfo.description,
            constitution,
            mission,
            override
        });

        const violations = checkResponse(roleCfg.roleId, result);
        allViolations.push(...violations);

        results.push({
            roleId: roleCfg.roleId,
            ...result
        });
    }

    return { results, violations: allViolations };
}

module.exports = { runCouncil };
