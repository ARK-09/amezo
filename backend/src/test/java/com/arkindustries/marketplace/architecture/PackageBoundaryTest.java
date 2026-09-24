package com.arkindustries.marketplace.architecture;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Compiles "features don't import each other's internals" into a rule
 * that fails the build, instead of leaving it as a convention nobody's
 * code is actually checked against. Not explicitly requested - flagged
 * as the one addition beyond the literal scaffold ask.
 *
 * common and config are deliberately excluded from the feature list:
 * they're the shared kernel and composition root, not features, and are
 * meant to be depended on by everything.
 *
 * DONT_INCLUDE_TESTS is required, not optional: an integration test in
 * catalog legitimately needs identity.SellerRepository to satisfy
 * product.seller_id's FK when building fixtures. That's normal test
 * setup, not the production-code coupling this rule exists to catch -
 * without this option every such fixture trips the rule.
 */
class PackageBoundaryTest {

    private static final String BASE = "com.arkindustries.marketplace";
    private static final String[] FEATURES = {"catalog", "orders", "reviews", "identity"};

    @Test
    void featuresDoNotDependOnEachOthersInternals() {
        JavaClasses classes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages(BASE);

        for (String feature : FEATURES) {
            String[] others = Arrays.stream(FEATURES)
                    .filter(f -> !f.equals(feature))
                    .map(f -> BASE + "." + f + "..")
                    .toArray(String[]::new);

            ArchRule rule = noClasses()
                    .that().resideInAPackage(BASE + "." + feature + "..")
                    .should().dependOnClassesThat().resideInAnyPackage(others)
                    .because("cross-feature access must go through a public service interface, "
                            + "not another feature's entities/repositories");

            rule.check(classes);
        }
    }
}
