module analysis_registry::AnalysisRegistry {
    use std::signer;
    use std::string::String;
    use std::vector;

    // Struct to store analysis data
    struct Analysis has key, store {
        analyzer: address,
        contract_id: String,
        risk_level: String,
        summary: String
    }

    // Global storage
    struct AnalyzerStore has key {
        analyses: vector<Analysis>,
        total_count: u64
    }

    // Initialize the module
    fun init_module(account: &signer) {
        move_to(account, AnalyzerStore {
            analyses: vector::empty(),
            total_count: 0
        });
    }

    // Submit analysis - Store the data
    public entry fun submit_analysis(
        account: &signer,
        contract_id: String,
        risk_level: String,
        summary: String
    ) acquires AnalyzerStore {
        let analyzer_addr = signer::address_of(account);
        let store = borrow_global_mut<AnalyzerStore>(@analysis_registry);
        
        // Create new analysis
        let new_analysis = Analysis {
            analyzer: analyzer_addr,
            contract_id: contract_id,
            risk_level: risk_level,
            summary: summary
        };
        
        // Add to store
        vector::push_back(&mut store.analyses, new_analysis);
        store.total_count = store.total_count + 1;
    }

    // Get total count
    public fun get_total_count(): u64 acquires AnalyzerStore {
        let store = borrow_global<AnalyzerStore>(@analysis_registry);
        store.total_count
    }
}
