import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SeedTest {
    @Test
    void one() {
        assertThat(Seed.one()).isEqualTo(1);
    }
}
